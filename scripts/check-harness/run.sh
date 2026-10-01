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
# The harness host's components, as projects.json names them: the project
# folder, the compose project the docker shim knows and one it does not, pm2
# apps the pm2 shim lists, one it does not, and one under another user's
# PM2_HOME, and three databases: MySQL read with DB_*, Postgres with a
# DATABASE_URL, and MySQL inside the container the docker shim knows (its
# credentials come from MYSQL_* in a CRLF file). The large-files floor drops to
# 1 MB for the 2 MiB upload.
cat >"$work/config/projects.json" <<'EOF'
{"version": 1, "projects": [{"id": "shop", "name": "shop", "components": [
  {"role": "fe", "host": "harness", "kind": "path", "path": "/home/daminus/app"},
  {"role": "be", "host": "harness", "kind": "compose", "project": "shop"},
  {"role": "be", "host": "harness", "kind": "compose", "project": "gone"},
  {"role": "worker", "host": "harness", "kind": "pm2", "app": "api"},
  {"role": "worker", "host": "harness", "kind": "pm2", "app": "queue"},
  {"role": "worker", "host": "harness", "kind": "pm2", "app": "deleted"},
  {"role": "worker", "host": "harness", "kind": "pm2", "app": "admin", "pm2_home": "/root/.pm2"},
  {"role": "db", "host": "harness", "kind": "db", "engine": "mysql", "database": "shop",
   "env_file": "/home/daminus/app/.env"},
  {"role": "db", "host": "harness", "kind": "db", "engine": "postgres", "database": "analytics",
   "env_file": "/home/daminus/app/.env.pg"},
  {"role": "db", "host": "harness", "kind": "db", "engine": "mysql", "database": "billing",
   "env_file": "/home/daminus/app/.env.billing", "container": "shop-db-1"}
]}]}
EOF
printf '%s\n' '{"version": 1, "scan": {"large_file_mb": 1}}' >"$work/config/settings.json"
# Longest the whole bundle may take in the container (server budget).
budget_s=60

cargo build -q -p daminus-core --features cli --bin daminus-dev
dev="$root/target/debug/daminus-dev"

# Runs a bundle file in the harness container. The probe hashes $HOME and /tmp
# (names, sizes, modes, mtimes and contents) before and after `sh -s`, and
# prints both hashes on stderr, which goes to $3.hash. The bundle's own stderr
# is merged into stdout ($3), so anything it printed there fails validation.
# ~/.pm2 gets a stand-in daemon: a process titled as pm2 titles its daemon.
# shellcheck disable=SC2016 # expanded inside the container, not here
probe='truncate -s 600M "$HOME/app/storage/logs/laravel.log"
sh -c "sleep 600; :" "PM2 v5.4.2: God Daemon ($HOME/.pm2)" </dev/null &
daemon=$!
printf %s "$daemon" >"$HOME/.pm2/pm2.pid"
: >"$HOME/.pm2/rpc.sock"
: >"$HOME/.pm2/pub.sock"
snap() {
	find "$HOME" /tmp -xdev -exec stat -c "%n %s %a %Y" {} + 2>/dev/null | sort
	find "$HOME" /tmp -xdev -type f -exec sha256sum {} + 2>/dev/null | sort
}
before=$(snap | sha256sum)
sh -s 2>&1
after=$(snap | sha256sum)
kill "$daemon"
printf "%s\n%s\n" "$before" "$after" >&2'
# The named volume is a device-backed directory mount (like a real data disk),
# so disk.fs has a filesystem to report besides the overlay root and the
# single-file bind mounts docker adds (/etc/hosts…), which it skips.
# storage/logs is a tmpfs holding a sparse 600 MiB laravel.log (made by the
# probe before the first hash, no real disk used) for logs.big to find.
# ~/.pm2 is a tmpfs that looks like a running daemon's home: pm2.pid names
# PID 1 (the container's shell) and the socket files are the user's and
# writable (on the read-only root they could not be), so pm2.app reaches
# the pm2 shim. Both mounts are other filesystems, left out of the hashes.
run_bundle() {
	docker run --rm -i \
		--read-only \
		--volume daminus-harness-data:/data:ro \
		--tmpfs /tmp:rw,nosuid,nodev,size=16m \
		--tmpfs /home/daminus/app/storage/logs:rw,nosuid,nodev,size=1m,uid=1500,gid=1500 \
		--tmpfs /home/daminus/.pm2:rw,nosuid,nodev,size=1m,uid=1500,gid=1500 \
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

	"$dev" --config-dir "$work/config" bundle --host harness >"$work/all.sh"
	t0=$(date +%s)
	run_bundle "$image" "$work/all.sh" "$work/all.ndjson"
	took=$(($(date +%s) - t0))
	verify "$distro all checks" "$work/all.ndjson"
	echo "$distro: whole bundle in ${took} s (budget ${budget_s} s)"
	if [ "$took" -ge "$budget_s" ]; then
		problem "$distro: the whole bundle took ${took} s, over the ${budget_s} s budget"
	fi

	mkdir -p "$fixtures/$tag"
	echo "$ids" | while read -r id script; do
		name=${script%.sh}
		out="$work/$tag-$name.ndjson"
		"$dev" --config-dir "$work/config" bundle --host harness --only "$id" >"$work/$name.sh"
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
