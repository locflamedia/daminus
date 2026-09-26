#!/bin/sh
# Read-only harness for the check scripts (CI job `shell`). Needs docker, jq
# and cargo. For each distro it builds the harness image, then runs the full
# bundle and each check alone in a container with a read-only root
# filesystem, as a normal user, with only /tmp writable (tmpfs), no network
# and no capabilities, and checks that:
#   - every stdout line is NDJSON v1, with `begin` and `end` (daminus-dev ndjson);
#   - no CANARY_ value (process env, .env, docker/pm2 shims) reaches stdout;
#   - nothing reaches stderr (it is merged into stdout, so it would fail the
#     NDJSON check), and $HOME and /tmp hash the same before and after.
# Each check's output is then compared with its golden fixture
# fixtures/ndjson/<distro>/<script>.ndjson by shape (line kinds, check ids,
# field names and types), since load and disk numbers differ per machine.
#
# Usage: scripts/check-harness/run.sh [--bless]   (--bless rewrites the fixtures)
set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)
here="$root/scripts/check-harness"
fixtures="$root/fixtures/ndjson"
bless=0
[ "${1-}" = "--bless" ] && bless=1

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM
mkdir -p "$work/config"

cargo build -q -p daminus-core --features cli --bin daminus-dev
dev="$root/target/debug/daminus-dev"

# Runs a bundle file in the harness container. The probe hashes $HOME and /tmp
# (names, sizes, modes, mtimes and contents) before and after `sh -s`, and
# prints both hashes on stderr, which goes to $3.hash. The bundle's own stderr
# is merged into stdout ($3), so anything it printed there fails validation.
# shellcheck disable=SC2016 # expanded inside the container, not here
probe='snap() {
	find "$HOME" /tmp -xdev -exec stat -c "%n %s %a %Y" {} + 2>/dev/null | sort
	find "$HOME" /tmp -xdev -type f -exec sha256sum {} + 2>/dev/null | sort
}
before=$(snap | sha256sum)
sh -s 2>&1
after=$(snap | sha256sum)
printf "%s\n%s\n" "$before" "$after" >&2'
# The named volume is a device-backed directory mount (like a real data disk),
# so disk.fs has a filesystem to report besides the overlay root and the
# single-file bind mounts docker adds (/etc/hosts…), which it skips.
run_bundle() {
	docker run --rm -i \
		--read-only \
		--volume daminus-harness-data:/data:ro \
		--tmpfs /tmp:rw,nosuid,nodev,size=16m \
		--ipc none \
		--network none \
		--cap-drop ALL \
		--security-opt no-new-privileges \
		--user daminus \
		"$1" sh -c "$probe" <"$2" >"$3" 2>"$3.hash"
}

fail=0
problem() {
	echo "FAIL: $*" >&2
	fail=1
}

# The shape of an NDJSON file: one line per distinct kind of line.
shape() {
	jq -c 'if has("_") then {_: ._, group: .group}
		else {check, unknown, unit,
			value: (.value | type),
			data: ((.data // {}) | with_entries(.value |= type)),
			fp: has("fp")}
		end' "$1" | sort -u
}

verify() { # label output-file
	if ! "$dev" --config-dir "$work/config" ndjson "$2"; then
		problem "$1: output is not valid NDJSON v1"
	fi
	if grep -q 'CANARY_' "$2"; then
		problem "$1: a canary secret leaked"
	fi
	if [ "$(sed -n '$=' "$2.hash")" != 2 ] || [ "$(sed -n 1p "$2.hash")" != "$(sed -n 2p "$2.hash")" ]; then
		problem "$1: \$HOME or /tmp changed during the run"
	fi
}

ids=$(jq -r '.checks[] | select(.script != null) | .id + " " + .script' "$root/crates/core/checks/manifest.json")

for distro in ubuntu:24.04 debian:12; do
	tag=$(printf '%s' "$distro" | tr ':' '-')
	image="daminus-harness:$tag"
	echo "== $distro"
	docker build -q --build-arg "BASE=$distro" -t "$image" "$here" >/dev/null

	"$dev" --config-dir "$work/config" bundle >"$work/all.sh"
	run_bundle "$image" "$work/all.sh" "$work/all.ndjson"
	verify "$distro all checks" "$work/all.ndjson"

	mkdir -p "$fixtures/$tag"
	echo "$ids" | while read -r id script; do
		name=${script%.sh}
		out="$work/$tag-$name.ndjson"
		"$dev" --config-dir "$work/config" bundle --only "$id" >"$work/$name.sh"
		run_bundle "$image" "$work/$name.sh" "$out"
		verify "$distro $id" "$out"
		golden="$fixtures/$tag/$name.ndjson"
		if [ "$bless" -eq 1 ]; then
			cp "$out" "$golden"
			echo "blessed $golden"
		elif [ ! -f "$golden" ]; then
			problem "$distro $id: no golden fixture (run with --bless)"
		elif ! shape "$out" >"$out.shape" || ! shape "$golden" >"$out.golden" ||
			! diff -u "$out.golden" "$out.shape"; then
			problem "$distro $id: output shape differs from $golden (run with --bless if intended)"
		fi
		[ "$fail" -eq 0 ] || exit 1
	done || fail=1
done

if [ "$fail" -ne 0 ]; then
	exit 1
fi
echo "check harness: ok"
