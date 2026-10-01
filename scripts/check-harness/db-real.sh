#!/bin/sh
# db.size against real servers (CI job `shell`). Needs docker, jq and cargo.
# Starts MySQL 8 and Postgres 16 containers, seeds them, and runs the db.size
# bundle against them in two ways:
#
#   native  a read-only container as a normal user, with the real mysql and
#           psql clients, reaching the servers over a private network with
#           the login from a `.env` file (DB_*, a DATABASE_URL, POSTGRES_*);
#   exec    on this machine, through `docker exec` into the server containers
#           (MYSQL_*, POSTGRES_*), as a project with a database container is
#           scanned.
#
# Every `.env` holds canary logins, which are the real passwords of the
# servers, one of them full of shell and option-file metacharacters. It fails
# unless, for every run:
#   - the output is NDJSON v1 and the size matches what the server reports;
#   - no CANARY_ value is on stdout, in the argument list of any client or
#     docker call (recorded by wrappers), or in what `ps` showed while the
#     bundle ran (sampled from /proc, or ps on this machine);
#   - $HOME and /tmp (the container) or the home and temp folders given to
#     the shell (exec) hash the same before and after;
# and for the whole run, that the data of both databases (a logical dump) and
# the servers' write counters are the same before and after. A refused login,
# an unreachable server and a database that does not exist must read as
# Unknown(needs_perm), a container that does not exist as Unknown(missing).
#
# Usage: scripts/check-harness/db-real.sh
set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)
here="$root/scripts/check-harness"
net=daminus-harness-net
my=daminus-harness-mysql
pg=daminus-harness-pg
# The native runs use each distro's default MySQL client (MySQL's on Ubuntu,
# MariaDB's on Debian) and its postgresql-client.
distros="ubuntu:24.04 debian:12"

# Logins of the servers. Every one is a canary.
root_pw=CANARY_dbreal_root_5c1e
my_pw=CANARY_dbreal_mysql_9d41
pg_pw=CANARY_dbreal_pg_77aa
# A password with a quote, a backslash, `#`, a space, `$HOME` and a backtick.
# odd_my is the same text as a MySQL string literal (backslash doubled).
# shellcheck disable=SC2016 # the text is literal on purpose
odd_pw='CANARY_odd#"\x $HOME `id`'
# shellcheck disable=SC2016 # the text is literal on purpose
odd_my='CANARY_odd#"\\x $HOME `id`'
wrong_pw=CANARY_wrong_0000

work=$(mktemp -d)
cleanup() {
	docker rm -f "$my" "$pg" >/dev/null 2>&1 || true
	docker network rm "$net" >/dev/null 2>&1 || true
	# DAMINUS_HARNESS_KEEP=1 leaves the work folder for a look at the outputs.
	if [ -n "${DAMINUS_HARNESS_KEEP-}" ]; then
		echo "kept $work" >&2
	else
		rm -rf "$work"
	fi
}
trap cleanup EXIT INT TERM
cleanup_servers() {
	docker rm -f "$my" "$pg" >/dev/null 2>&1 || true
	docker network rm "$net" >/dev/null 2>&1 || true
}
cleanup_servers

fail=0
problem() {
	echo "FAIL: $*" >&2
	fail=1
}

cargo build -q -p daminus-core --features cli --bin daminus-dev
dev="$root/target/debug/daminus-dev"

echo "== images"
for distro in $distros; do
	tag=$(printf '%s' "$distro" | tr ':' '-')
	client_pkg=default-mysql-client
	[ "$distro" != ubuntu:24.04 ] || client_pkg=mysql-client
	docker build -q --build-arg "BASE=$distro" -t "daminus-harness:$tag" "$here" >/dev/null
	docker build -q -f "$here/Dockerfile.db" --build-arg "BASE_IMAGE=daminus-harness:$tag" \
		--build-arg "MYSQL_CLIENT=$client_pkg" -t "daminus-harness-db:$tag" "$here" >/dev/null
done

echo "== servers"
docker network create "$net" >/dev/null
docker run -d --name "$my" --network "$net" \
	-e MYSQL_ROOT_PASSWORD="$root_pw" -e MYSQL_DATABASE=shop \
	-e MYSQL_USER=shop -e MYSQL_PASSWORD="$my_pw" mysql:8.0 >/dev/null
docker run -d --name "$pg" --network "$net" \
	-e POSTGRES_USER=shop -e POSTGRES_PASSWORD="$pg_pw" -e POSTGRES_DB=shop postgres:16 >/dev/null

# The servers restart once after their first initialisation; TCP answers only
# once the real server is up.
wait_for() { # label command...
	label=$1
	shift
	n=0
	until "$@" >/dev/null 2>&1; do
		n=$((n + 1))
		if [ "$n" -gt 120 ]; then
			echo "$label did not come up" >&2
			docker logs "$label" 2>&1 | tail -20 >&2 || true
			exit 1
		fi
		sleep 1
	done
}
wait_for "$my" docker exec -e MYSQL_PWD="$root_pw" "$my" mysqladmin -h 127.0.0.1 -uroot ping
wait_for "$pg" docker exec "$pg" pg_isready -h 127.0.0.1 -U shop -d shop
# pg_isready answers during the init server too (socket only), so ask over TCP.
wait_for "$pg" docker exec -e PGPASSWORD="$pg_pw" "$pg" psql -h 127.0.0.1 -U shop -d shop -c 'SELECT 1'

root_sql() { docker exec -i -e MYSQL_PWD="$root_pw" "$my" mysql -uroot shop; }
pg_sql() { docker exec -i -e PGPASSWORD="$pg_pw" "$pg" psql -h 127.0.0.1 -U shop -d shop -v ON_ERROR_STOP=1 -q; }

# Test data: a big table and a small one in each, and a second login with the
# odd password that may only read.
{
	printf '%s\n' 'CREATE TABLE orders (id INT PRIMARY KEY AUTO_INCREMENT, body TEXT) ENGINE=InnoDB;'
	printf '%s\n' "INSERT INTO orders (body) SELECT REPEAT('x', 1000) FROM information_schema.columns LIMIT 2000;"
	printf '%s\n' 'CREATE TABLE tiny (a INT);' 'INSERT INTO tiny VALUES (1), (2), (3);'
	printf "CREATE USER 'shop2'@'%%' IDENTIFIED BY '%s';\n" "$odd_my"
	printf '%s\n' "GRANT SELECT ON shop.* TO 'shop2'@'%';"
	# MySQL 8 caches table statistics; refresh them so the sizes are current.
	printf '%s\n' 'ANALYZE TABLE orders, tiny;'
} | root_sql >/dev/null
{
	printf '%s\n' 'CREATE TABLE orders (id serial PRIMARY KEY, body text);'
	printf '%s\n' "INSERT INTO orders (body) SELECT repeat('x', 1000) FROM generate_series(1, 2000);"
	printf '%s\n' 'CREATE TABLE tiny (a int);' 'INSERT INTO tiny VALUES (1), (2), (3);'
	printf "CREATE ROLE shop2 LOGIN PASSWORD '%s';\n" "$odd_pw"
	printf '%s\n' 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO shop2;'
	printf '%s\n' 'ANALYZE;'
} | pg_sql

# What the servers say, for comparing with the facts, and what they hold.
my_size() {
	docker exec -e MYSQL_PWD="$root_pw" "$my" mysql -uroot -N -B -e \
		"SELECT SUM(data_length + index_length) FROM information_schema.tables WHERE table_schema = 'shop' AND engine IS NOT NULL"
}
pg_size() {
	docker exec -e PGPASSWORD="$pg_pw" "$pg" psql -h 127.0.0.1 -U shop -d shop -At -c "SELECT pg_database_size('shop')"
}
# Data (a dump) and write counters, hashed: equal before and after means the
# bundle changed nothing (the counters are printed as they are, for the diff
# of a failure). pg_dump prints a random `\restrict` token, dropped.
db_state() {
	docker exec -e MYSQL_PWD="$root_pw" "$my" sh -c \
		"mysqldump -uroot --no-tablespaces --skip-comments --single-transaction shop | sha256sum"
	docker exec -e MYSQL_PWD="$root_pw" "$my" mysql -uroot -N -B -e \
		"SHOW GLOBAL STATUS WHERE Variable_name IN ('Com_insert','Com_update','Com_delete','Com_replace','Com_truncate','Com_create_table','Com_drop_table','Com_alter_table','Com_insert_select','Com_update_multi','Com_delete_multi')"
	docker exec -e PGPASSWORD="$pg_pw" "$pg" sh -c \
		"pg_dump -h 127.0.0.1 -U shop shop | grep -v '^.restrict\|^.unrestrict' | sha256sum"
	docker exec -e PGPASSWORD="$pg_pw" "$pg" psql -h 127.0.0.1 -U shop -d shop -At -c \
		"SELECT relname, n_tup_ins, n_tup_upd, n_tup_del FROM pg_stat_user_tables ORDER BY 1"
}
sleep 2
my_want=$(my_size)
pg_want=$(pg_size)
state_before=$(db_state)
echo "mysql shop: $my_want bytes, postgres shop: $pg_want bytes"

# ---------------------------------------------------------------- the runs

# $HOME and /tmp (names, sizes, modes, mtimes, contents) before and after,
# a /proc sampler for what `ps` shows, and the wrappers' recorded calls, all
# printed on stderr after the two hashes.
# shellcheck disable=SC2016 # expanded inside the container, not here
probe='sample() {
	while [ ! -e /argv-log/stop ]; do
		for f in /proc/[0-9]*/cmdline; do
			tr "\000" " " <"$f" 2>/dev/null
			echo
		done
		sleep 0.01
	done | awk "{ l = substr(\$0, 1, 1000) } !seen[l]++ { print l; fflush() }" >>/argv-log/ps
}
sample 2>/dev/null &
snap() {
	find "$HOME" /tmp -xdev -exec stat -c "%n %s %a %Y" {} + 2>/dev/null | sort
	find "$HOME" /tmp -xdev -type f -exec sha256sum {} + 2>/dev/null | sort
}
before=$(snap | sha256sum)
sh -s 2>&1
after=$(snap | sha256sum)
: >/argv-log/stop
wait
printf "%s\n%s\n" "$before" "$after" >&2
printf "%s\n" "--calls" >&2
cat /argv-log/calls >&2 2>/dev/null || true
printf "%s\n" "--ps" >&2
cat /argv-log/ps >&2'

run_native() { # bundle out
	docker run --rm -i \
		--read-only \
		--network "$net" \
		--volume "$work/env:/home/daminus/db-env:ro" \
		--tmpfs /tmp:rw,nosuid,nodev,size=16m \
		--tmpfs /argv-log:rw,nosuid,nodev,size=8m,uid=1500,gid=1500 \
		--ipc none \
		--cap-drop ALL \
		--security-opt no-new-privileges \
		--user daminus \
		"$image" sh -c "$probe" <"$1" >"$2" 2>"$2.err"
}

mkdir -p "$work/env" "$work/exec-bin" "$work/exec-home" "$work/exec-tmp"
real_docker=$(command -v docker)
cat >"$work/exec-bin/docker" <<'EOF'
#!/bin/sh
# Records the argument list of every docker call of the bundle, then runs it.
{
	printf 'docker'
	for a in "$@"; do printf ' [%s]' "$a"; done
	printf '\n'
} >>"$HARNESS_CALLS"
exec "$HARNESS_DOCKER" "$@"
EOF
chmod +x "$work/exec-bin/docker"

# The same hash for a folder on this machine, and what `ps` showed.
host_snap() {
	{
		find "$work/exec-home" "$work/exec-tmp" | sort
		find "$work/exec-home" "$work/exec-tmp" -type f -exec cksum {} + | sort
	} | cksum
}
run_exec() { # bundle out
	: >"$work/exec-calls"
	: >"$work/exec-ps"
	rm -f "$work/exec-stop"
	{
		while [ ! -e "$work/exec-stop" ]; do
			ps -A -o args= 2>/dev/null
			sleep 0.01
		done
	} | awk '!seen[$0]++ { print; fflush() }' >>"$work/exec-ps" &
	before=$(host_snap)
	HOME="$work/exec-home" TMPDIR="$work/exec-tmp" HARNESS_CALLS="$work/exec-calls" \
		HARNESS_DOCKER="$real_docker" PATH="$work/exec-bin:$PATH" \
		sh -s <"$1" >"$2" 2>"$2.err" || true
	after=$(host_snap)
	: >"$work/exec-stop"
	wait
	{
		printf '%s\n%s\n' "$before" "$after"
		printf '%s\n' '--calls'
		cat "$work/exec-calls"
		printf '%s\n' '--ps'
		cat "$work/exec-ps"
	} >"$2.err"
}

# case_run MODE LABEL ENGINE DATABASE CONTAINER ENV-TEXT EXPECT
# MODE native|exec. EXPECT ok | needs_perm | missing.
case_run() {
	mode=$1 label=$2 engine=$3 database=$4 container=$5 envtext=$6 expect=$7
	printf '%s' "$envtext" >"$work/env/$label.env"
	chmod 0644 "$work/env/$label.env"
	if [ "$mode" = native ]; then
		envfile="/home/daminus/db-env/$label.env"
	else
		envfile="$work/env/$label.env"
	fi
	mkdir -p "$work/cfg-$label"
	jq -n --arg e "$engine" --arg d "$database" --arg f "$envfile" --arg c "$container" \
		'{version: 1, projects: [{id: "shop", name: "shop", components: [
		  ({role: "db", host: "harness", kind: "db", engine: $e, database: $d, env_file: $f}
		   + (if $c == "" then {} else {container: $c} end))]}]}' >"$work/cfg-$label/projects.json"
	printf '%s\n' '{"version": 1}' >"$work/cfg-$label/settings.json"
	"$dev" --config-dir "$work/cfg-$label" bundle --host harness --only db.size >"$work/$label.sh"
	out="$work/$label.ndjson"
	if [ "$mode" = native ]; then run_native "$work/$label.sh" "$out"; else run_exec "$work/$label.sh" "$out"; fi

	if ! "$dev" --config-dir "$work/cfg-$label" ndjson "$out" >/dev/null; then
		problem "$ctx $label: output is not valid NDJSON v1"
	fi
	if grep -q 'CANARY_' "$out"; then
		problem "$ctx $label: a canary reached stdout"
	fi
	err="$out.err"
	if [ "$(sed -n 1p "$err")" != "$(sed -n 2p "$err")" ]; then
		problem "$ctx $label: the home or temp folder changed during the run"
	fi
	calls=$(awk '/^--calls$/ { m = 1; next } /^--ps$/ { m = 2; next } m == 1' "$err")
	seen=$(awk '/^--ps$/ { m = 1; next } m == 1' "$err")
	if printf '%s\n%s\n' "$calls" "$seen" | grep -q 'CANARY_\|shop2'; then
		problem "$ctx $label: a login was on a command line"
	fi
	if [ "$expect" != missing ] && ! printf '%s\n' "$calls" | grep -q .; then
		problem "$ctx $label: the recorder saw no client call"
	fi
	if printf '%s\n' "$calls" | grep -q '\[mysql\]\|^mysql ' &&
		! printf '%s\n' "$calls" | grep -q '\[--defaults-extra-file=/dev/stdin\]'; then
		problem "$ctx $label: mysql was not given its login on stdin"
	fi

	case $expect in
	ok)
		want=$my_want
		[ "$engine" = postgres ] && want=$pg_want
		if ! jq -e -s --arg t "$database" --arg e "$engine" --argjson w "$want" '
			map(select(.check == "db.size" and .target == $t)) as $f
			| ($f | length) == 1
			and ($f[0].unknown == null)
			and ($f[0].unit == "bytes")
			and ((($f[0].value - $w) | fabs) <= ($w * 0.01))
			and ($f[0].data.engine == $e)
			and ($f[0].data.tables == 2)
			and ($f[0].data.top[0][0] == "orders")
			and ($f[0].data.top[1][0] == "tiny")
			and ($f[0].data.top[0][1] > $f[0].data.top[1][1])' "$out" >/dev/null; then
			problem "$ctx $label: unexpected fact: $(grep '"db.size"' "$out")"
		fi
		;;
	*)
		if ! jq -e -s --arg t "$database" --arg r "$expect" \
			'map(select(.check == "db.size" and .target == $t)) | length == 1 and .[0].unknown == $r' "$out" >/dev/null; then
			problem "$ctx $label: want unknown $expect, got: $(grep '"db.size"' "$out")"
		fi
		;;
	esac
	echo "ok: $ctx $label ($expect)"
}

native_cases() {
case_run native my-basic mysql shop "" "DB_CONNECTION=mysql
DB_HOST=$my
DB_PORT=3306
DB_USERNAME=shop
DB_PASSWORD=\"$my_pw\"
" ok
case_run native my-odd mysql shop "" "export DB_HOST=$my
export DB_USERNAME=shop2
export DB_PASSWORD='$odd_pw'
" ok
case_run native pg-url postgres shop "" "DATABASE_URL=postgresql://shop:$pg_pw@$pg:5432/shop
" ok
case_run native pg-odd postgres shop "" "POSTGRES_USER=shop2
POSTGRES_PASSWORD='$odd_pw'
POSTGRES_HOST=$pg
POSTGRES_PORT=5432
" ok
case_run native my-wrong mysql shop "" "DB_HOST=$my
DB_USERNAME=shop
DB_PASSWORD=$wrong_pw
" needs_perm
case_run native pg-wrong postgres shop "" "DATABASE_URL=postgresql://shop:$wrong_pw@$pg:5432/shop
" needs_perm
case_run native my-nodb mysql nodb "" "DB_HOST=$my
DB_USERNAME=shop
DB_PASSWORD=$my_pw
" needs_perm
case_run native my-nohost mysql shop "" "DB_HOST=daminus-harness-nowhere
DB_USERNAME=shop
DB_PASSWORD=$my_pw
" needs_perm
case_run native my-shell mysql shop "" "DB_HOST=$my
DB_USERNAME=shop
DB_PASSWORD=\$(touch /tmp/pwned)
" needs_perm

}
for distro in $distros; do
	tag=$(printf '%s' "$distro" | tr ':' '-')
	image="daminus-harness-db:$tag"
	ctx=$distro
	echo "== native, $distro (read-only container, real clients)"
	native_cases
done

ctx=host
echo "== exec (docker exec into the server containers)"
case_run exec x-my mysql shop "$my" "MYSQL_USER=shop
MYSQL_PASSWORD=$my_pw
" ok
case_run exec x-my-odd mysql shop "$my" "MYSQL_USER=shop2
MYSQL_PASSWORD='$odd_pw'
" ok
case_run exec x-pg postgres shop "$pg" "POSTGRES_USER=shop
POSTGRES_PASSWORD=$pg_pw
" ok
case_run exec x-pg-odd postgres shop "$pg" "DB_USERNAME=shop2
DB_PASSWORD='$odd_pw'
" ok
case_run exec x-my-wrong mysql shop "$my" "MYSQL_USER=shop
MYSQL_PASSWORD=$wrong_pw
" needs_perm
case_run exec x-gone mysql shop daminus-harness-gone "MYSQL_USER=shop
MYSQL_PASSWORD=$my_pw
" missing

echo "== data"
state_after=$(db_state)
if [ "$state_before" != "$state_after" ]; then
	problem "the data or the write counters of a database changed during the runs"
	printf '%s\n' "$state_before" >"$work/state-before"
	printf '%s\n' "$state_after" >"$work/state-after"
	diff "$work/state-before" "$work/state-after" >&2 || true
fi

if [ "$fail" -ne 0 ]; then
	exit 1
fi
echo "db real: ok"
