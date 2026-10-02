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
# The setup scripts (login, discover) run the same way, in the planted
# container, and their records are compared with fixtures/discover/<distro>/.
#
# Usage: scripts/check-harness/run.sh [--bless]   (--bless rewrites the fixtures)
set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)
here="$root/scripts/check-harness"
fixtures="$root/fixtures/ndjson"
setup_fixtures="$root/fixtures/discover"
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
# 1 MB for the 2 MiB upload. A second project folder has a backslash and a
# quote in its name (JSON-escaped here).
cat >"$work/config/projects.json" <<'EOF'
{"version": 1, "projects": [{"id": "shop", "name": "shop", "components": [
  {"role": "fe", "host": "harness", "kind": "path", "path": "/home/daminus/app"},
  {"role": "fe", "host": "harness", "kind": "path", "path": "/home/daminus/old\\shop \"x\""},
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
printf '%s\n' '{"version": 1, "scan": {"large_file_mb": 1, "disabled_groups": []}}' >"$work/config/settings.json"
# The clean project folder, for the security checks' ok case: the same host,
# a folder with no PHP in its uploads. (The recent-code-changes group is off
# by default; the harness turns every group on.)
mkdir -p "$work/config-clean"
cp "$work/config/settings.json" "$work/config-clean/settings.json"
cat >"$work/config-clean/projects.json" <<'EOF2'
{"version": 1, "projects": [{"id": "clean", "name": "clean", "components": [
  {"role": "fe", "host": "harness", "kind": "path", "path": "/home/daminus/clean"}
]}]}
EOF2
# Longest the whole bundle may take in the container (server budget).
budget_s=60

cargo build -q -p daminus-core --features cli --bin daminus-dev
dev="$root/target/debug/daminus-dev"

# Runs a bundle file in the harness container: run_bundle IMAGE BUNDLE OUT
# [infected]. probe.sh does the work and prints the two $HOME and /tmp hashes
# on stderr, which goes to OUT.hash. With `infected` the container also looks
# compromised (PLANT=1, and /etc/ld.so.preload bind-mounted from
# $work/ld.so.preload, written per distro below); otherwise it is a clean server.
# The named volume is a device-backed directory mount (like a real data disk),
# so disk.fs has a filesystem to report besides the overlay root and the
# single-file bind mounts docker adds (/etc/hosts…), which it skips.
# storage/logs is a tmpfs holding a sparse 600 MiB laravel.log (made by the
# probe before the first hash, no real disk used) for logs.big to find.
# ~/.pm2 is a tmpfs that looks like a running daemon's home: pm2.pid names
# PID 1 (the container's shell) and the socket files are the user's and
# writable (on the read-only root they could not be), so pm2.app reaches
# the pm2 shim. Both mounts are other filesystems, left out of the hashes.
# /tmp allows execution, as on most servers: the planted miner runs from there.
# --ipc none leaves no /dev/shm, so one is mounted for the planted executable.
run_bundle() {
	image=$1 bundle=$2 out=$3
	if [ "${4-}" = infected ]; then
		set -- -e PLANT=1 -v "$work/ld.so.preload:/etc/ld.so.preload:ro"
	else
		set --
	fi
	docker run --rm -i \
		--read-only \
		--volume daminus-harness-data:/data:ro \
		--tmpfs /tmp:rw,exec,nosuid,nodev,size=16m \
		--tmpfs /dev/shm:rw,nosuid,nodev,size=1m \
		--tmpfs /home/daminus/app/storage/logs:rw,nosuid,nodev,size=1m,uid=1500,gid=1500 \
		--tmpfs /home/daminus/.pm2:rw,nosuid,nodev,size=1m,uid=1500,gid=1500 \
		--ipc none \
		--network none \
		--cap-drop ALL \
		--security-opt no-new-privileges \
		--user daminus \
		"$@" "$image" sh /opt/daminus-harness/probe.sh <"$bundle" >"$out" 2>"$out.hash"
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

# The shape of a file of setup records: one line per distinct kind of record
# and the names and types of its fields.
shape_records() {
	jq -c 'if has("_") then {_: ._}
		else {rec, fields: (to_entries | map(.key + ":" + (.value | type)) | sort)}
		end' "$1" | sort -u
}

# golden_check LABEL OUTPUT GOLDEN [SHAPE-FUNCTION]: the output has the
# golden's shape (or becomes the golden with --bless).
golden_check() {
	if [ "$bless" -eq 1 ]; then
		cp "$2" "$3"
		echo "blessed $3"
	elif [ ! -f "$3" ]; then
		problem "$1: no golden fixture (run with --bless)"
	elif ! "${4:-shape}" "$2" >"$2.shape" || ! "${4:-shape}" "$3" >"$2.golden" ||
		! diff -u "$2.golden" "$2.shape"; then
		problem "$1: output shape differs from $3 (run with --bless if intended)"
	fi
}

verify() { # label output-file [--records]
	if ! "$dev" --config-dir "$work/config" ndjson ${3:+"$3"} "$2"; then
		problem "$1: output is not valid NDJSON v1"
	fi
	if grep -q 'CANARY_' "$2"; then
		problem "$1: a canary secret leaked"
	fi
	if [ "$(sed -n '$=' "$2.hash")" != 2 ] || [ "$(sed -n 1p "$2.hash")" != "$(sed -n 2p "$2.hash")" ]; then
		problem "$1: \$HOME or /tmp changed during the run"
	fi
}

# expect LABEL FILE FILTER [JQ-ARG…]: the file, read as one array of lines,
# satisfies the jq filter.
# shellcheck disable=SC2016 # the filters are jq programs, not shell
expect() {
	label=$1 file=$2 filter=$3
	shift 3
	if ! jq -e -s "$@" "$filter" "$file" >/dev/null; then
		problem "$label"
	fi
}

# The project folder named with a backslash and a quote: each check that walks
# it reports it under its own name, and the names inside come back whole.
# shellcheck disable=SC2016 # the filters are jq programs, not shell
check_odd_folder() { # distro file
	expect "$1 disk.path, sec.upload_php: a folder named with a backslash and a quote" "$2" '
		"/home/daminus/old\\shop \"x\"" as $p
		| ([.[] | select(.check == "disk.path" and .target == $p)] | length) == 1
		and ([.[] | select(.check == "disk.path" and .target == $p)][0]
			| (.unknown | not) and .data.top[0][0] == "sub\\dir"
			and (.data.files | map(. == ["sub\\dir/big.bin", 2097152]) | any))
		and ([.[] | select(.check == "sec.upload_php" and .target == ($p + "/uploads/s\\h.php"))] | length) == 1'
}

# What the security checks must find in the planted (infected) container. A
# file's fingerprint is size:mtime: and 12 hex digits.
# shellcheck disable=SC2016 # the filters are jq programs, not shell
check_infected() { # distro file libc
	d=$1 f=$2
	re='^[0-9]+:[0-9]+:[0-9a-f]{12}$'
	expect "$d sec.miner: the miner and the deleted hidden job" "$f" '
		[.[] | select(.check == "sec.miner")] as $m
		| ($m | map(select(.target == "xmrig" and .data.why == "name" and (.data.deleted | not))) | length) == 1
		and ($m | map(select(.target == ".hidden-job" and .data.why == "deleted" and .data.deleted)) | length) == 1
		and ($m | all(.data.seen == .data.total and (.unknown | not)))'
	expect "$d sec.upload_php: avatar.php" "$f" '
		[.[] | select(.check == "sec.upload_php")] as $u
		| ($u | map(select(.target == "/home/daminus/app/public/uploads/avatar.php" and (.fp | test($re)))) | length) == 1
		and ($u | map(select(.target | startswith("/home/daminus/clean"))) | length) == 0' --arg re "$re"
	expect "$d sec.tmp_exec: executables in /tmp and /dev/shm" "$f" '
		[.[] | select(.check == "sec.tmp_exec") | .target] | contains(["/tmp/xmrig", "/dev/shm/kinsing"])'
	expect "$d sec.preload: the preloaded library" "$f" '
		[.[] | select(.check == "sec.preload")]
		| length == 1 and .[0].target == "/etc/ld.so.preload" and .[0].data.entries == 1
		and .[0].data.libs == [$lib] and (.[0].fp | test($re))' --arg lib "$3" --arg re "$re"
	# 3306 is held by a server named mariadbd on all addresses; 6379 by perl,
	# also on all addresses. 8080 is open to everyone too, but is not a
	# database port, and 5432 is a database port that only 127.0.0.1 can reach:
	# neither is reported.
	expect "$d sec.ports: mariadbd on 0.0.0.0:3306 and perl on 6379, not 8080 or loopback 5432" "$f" '
		[.[] | select(.check == "sec.ports")] as $p
		| ($p | map(.target) | sort) == ["3306", "6379"]
		and ($p | map(select(.target == "3306")) | all(.data.proc == "mariadbd" and .data.port == 3306 and .fp == "3306/mariadbd"))
		and ($p | map(select(.target == "6379")) | all(.data.proc == "perl" and .fp == "6379/perl"))'
	expect "$d sec.recent_change: counts the project folder" "$f" '
		[.[] | select(.check == "sec.recent_change" and .target == "/home/daminus/app")]
		| length == 1 and (.[0].value | type) == "number" and (.[0].data.files | length) <= 10'
}

# On the clean server: every security check says "looked, found none" and
# none is unknown (the container's processes are all the user's, so the miner
# check saw every one).
# shellcheck disable=SC2016 # the filters are jq programs, not shell
check_clean() { # distro file
	expect "$1 clean server: every security check found nothing" "$2" '
		[.[] | select((.check // "" | startswith("sec.")) and .check != "sec.recent_change")] as $s
		| ($s | length) == 5 and ($s | all(.value == 0 and (.unknown | not)))
		and ($s | map(select(.check == "sec.miner")) | all(.data.seen == .data.total))'
}

# What the login test must say about the container: who the user is, that it
# has no docker group but the (shimmed) docker answers, GNU find, and the three
# folders it was asked about.
# shellcheck disable=SC2016 # the filters are jq programs, not shell
check_login() { # distro file
	expect "$1 login: the user, its access and the folders asked about" "$2" '
		([.[] | select(.rec == "login")] | length) == 1
		and ([.[] | select(.rec == "login")][0]
			| .os == "Linux" and .user == "daminus" and .uid == 1500 and .root == false
			and .docker_group == false and .adm_group == false and .docker == "ok"
			and .gnu_find == true and (.distro | length) > 0 and (.kernel | length) > 0)
		and ([.[] | select(.rec == "path") | {(.path): .state}] | add)
			== {"/home/daminus/app": "readable", "/root": "denied", "/nope/x": "missing"}'
}

# What discover must find in the planted container (see Dockerfile, probe.sh
# and the docker and pm2 shims): the nginx blocks with an upstream resolved and
# commented-out config ignored, compose projects with their published ports and
# database containers (the one-off container left out), pm2 apps with their
# folder (the first pm_cwd wins over the one in the app's env), the pm2 daemon
# of another user it may not ask, a database process, the .env files by path
# (the example and sample files excluded; names with a quote or a backslash
# must still come out as valid JSON), and listening ports with their holder.
# shellcheck disable=SC2016 # the filters are jq programs, not shell
check_discover() { # distro file
	d=$1 f=$2
	expect "$d discover: nginx server blocks" "$f" '
		[.[] | select(.rec == "vhost")] as $v
		| ($v | map(select(.names | index("shop-x.example.com"))) | length) == 1
		and ($v | map(select(.names | index("shop-x.example.com")))[0]
			| .root == "/home/daminus/app/public" and .php == true and .ssl == false
			and .names == ["shop-x.example.com", "www.shop-x.example.com"])
		and ($v | map(select(.names == ["api.shop-x.example.com"]))[0]
			| .proxy == "127.0.0.1:3000" and .ssl == true and (has("root") | not))
		and ($v | map(select(.names == ["_"])) | length) == 1
		and ($v | map(select(.names == ["blog.example.org"]))[0] | .root == "/home/daminus/clean")
		and ($v | map(.names[]) | index("commented.example.com") | not)'
	expect "$d discover: compose projects and database containers" "$f" '
		[.[] | select(.rec == "compose")] as $c
		| ($c | map(.project) | sort) == ["blog", "shop"]
		and ($c | map(select(.project == "shop"))[0]
			| .dir == "/home/daminus/app" and .services == ["app", "db"]
			and .running == 2 and .total == 2 and .ports == [3000])
		and ([.[] | select(.rec == "db" and .origin == "container")] | map(.name) | sort)
			== ["legacy-pg", "shop-db-1"]
		and ([.[] | select(.rec == "db" and .name == "shop-db-1")][0]
			| .engine == "mysql" and .project == "shop")
		and ([.[] | select(.rec == "db" and .name == "legacy-pg")][0]
			| .engine == "postgres" and (has("project") | not))'
	expect "$d discover: pm2 apps, and the daemon of another user" "$f" '
		[.[] | select(.rec == "pm2")] as $p
		| ($p | map(.app) | sort) == ["api", "queue"]
		and ($p | map(select(.app == "api"))[0]
			| .instances == 2 and .cwd == "/home/daminus/app" and .default == true
			and .status == "online" and .home == "/home/daminus/.pm2")
		and ($p | map(select(.app == "queue"))[0]
			| .cwd == "/home/daminus/app/worker" and .status == "errored")
		and ([.[] | select(.rec == "pm2_home")] | map(.home) == ["/root/.pm2"])'
	expect "$d discover: the database server running as a process" "$f" '
		[.[] | select(.rec == "db" and .origin == "process")]
		== [{"rec": "db", "engine": "mysql", "origin": "process", "name": "mariadbd"}]'
	expect "$d discover: .env files by path, never by content" "$f" '
		([.[] | select(.rec == "env")] | map(.path) | sort)
			== ["/home/daminus/app/.env", "/home/daminus/app/.env.back\\slash", "/home/daminus/app/.env.billing",
				"/home/daminus/app/.env.pg", "/home/daminus/app/.env.q\"uote"]
		and ([.[] | select(.rec == "env")] | all(.readable == true and (keys | sort) == ["path", "readable", "rec"]))'
	expect "$d discover: listening ports and who holds them" "$f" '
		[.[] | select(.rec == "port")] as $p
		| ($p | map(select(.port == 3306))[0] | .bind == "any" and .proc == "mariadbd")
		and ($p | map(select(.port == 5432))[0] | .bind == "loopback" and .proc == "perl")
		and ($p | map(select(.port == 3000))[0]
			| .bind == "loopback" and .proc == "perl" and .cwd == "/home/daminus/app")
		and ($p | map(select(.port == 6379))[0] | .bind == "any")
		and ($p | map(select(.port == 8080))[0] | .bind == "any")'
}

ids=$(jq -r '.checks[] | select(.script != null) | .id + " " + .script' "$root/crates/core/checks/manifest.json")

for distro in ubuntu:24.04 debian:12; do
	tag=$(printf '%s' "$distro" | tr ':' '-')
	image="daminus-harness:$tag"
	echo "== $distro"
	docker build -q --build-arg "BASE=$distro" -t "$image" "$here" >/dev/null
	# The library a rootkit would preload is stood in for by libc, which every
	# program may load harmlessly.
	lib=$(docker run --rm "$image" sh -c 'ls /lib/*-linux-gnu/libc.so.6 /usr/lib/*-linux-gnu/libc.so.6 2>/dev/null | head -n 1')
	if [ -z "$lib" ]; then
		problem "$distro: no libc to stand in for a preloaded library"
		exit 1
	fi
	printf '%s\n' "$lib" >"$work/ld.so.preload"

	"$dev" --config-dir "$work/config" bundle --host harness >"$work/all.sh"
	t0=$(date +%s)
	run_bundle "$image" "$work/all.sh" "$work/all.ndjson" infected
	took=$(($(date +%s) - t0))
	verify "$distro all checks" "$work/all.ndjson"
	echo "$distro: whole bundle in ${took} s (budget ${budget_s} s)"
	if [ "$took" -ge "$budget_s" ]; then
		problem "$distro: the whole bundle took ${took} s, over the ${budget_s} s budget"
	fi
	check_infected "$distro" "$work/all.ndjson" "$lib"
	check_odd_folder "$distro" "$work/all.ndjson"

	# The same security checks on a clean server (a folder with no PHP in its
	# uploads, nothing planted): every one must say "looked, found none".
	"$dev" --config-dir "$work/config-clean" bundle --host harness \
		--only sec.miner --only sec.upload_php --only sec.tmp_exec --only sec.preload \
		--only sec.ports --only sec.recent_change >"$work/clean.sh"
	run_bundle "$image" "$work/clean.sh" "$work/clean.ndjson"
	verify "$distro clean server" "$work/clean.ndjson"
	check_clean "$distro" "$work/clean.ndjson"

	# The setup scripts, in the planted container (listeners, a database
	# process): the login test asks about three folders (readable, denied,
	# missing), and discover reads the host. Both records files are checked
	# like a check's output (read-only: $HOME and /tmp hash the same, no
	# canary), then compared with the golden by shape.
	mkdir -p "$setup_fixtures/$tag"
	"$dev" --config-dir "$work/config" setup-bundle login \
		--path /home/daminus/app --path /root --path /nope/x >"$work/login.sh"
	"$dev" --config-dir "$work/config" setup-bundle discover >"$work/discover.sh"
	for script in login discover; do
		out="$work/$tag-$script.ndjson"
		t0=$(date +%s)
		run_bundle "$image" "$work/$script.sh" "$out" infected
		took=$(($(date +%s) - t0))
		verify "$distro $script" "$out" --records
		echo "$distro: $script in ${took} s"
		golden_check "$distro $script" "$out" "$setup_fixtures/$tag/$script.ndjson" shape_records
	done
	check_login "$distro" "$work/$tag-login.ndjson"
	check_discover "$distro" "$work/$tag-discover.ndjson"

	mkdir -p "$fixtures/$tag/infected"
	echo "$ids" | while read -r id script; do
		name=${script%.sh}
		cfg="$work/config"
		case $name in
		sec_*)
			# The planted container's findings are kept in `infected/`; the
			# golden every other consumer replays (a healthy host) comes from
			# the clean server.
			"$dev" --config-dir "$work/config" bundle --host harness --only "$id" >"$work/$name.sh"
			out="$work/$tag-$name.planted.ndjson"
			run_bundle "$image" "$work/$name.sh" "$out" infected
			verify "$distro $id (planted)" "$out"
			golden_check "$distro $id (planted)" "$out" "$fixtures/$tag/infected/$name.ndjson"
			cfg="$work/config-clean"
			;;
		esac
		"$dev" --config-dir "$cfg" bundle --host harness --only "$id" >"$work/$name.sh"
		out="$work/$tag-$name.ndjson"
		run_bundle "$image" "$work/$name.sh" "$out"
		verify "$distro $id" "$out"
		golden_check "$distro $id" "$out" "$fixtures/$tag/$name.ndjson"
		[ "$fail" -eq 0 ] || exit 1
	done || fail=1
done

if [ "$fail" -ne 0 ]; then
	exit 1
fi
echo "check harness: ok"
