#!/bin/sh
# The setup flow end to end against a fake server (needs docker, jq, cargo and
# OpenSSH). A container runs a real sshd with a user that logs in by key, an
# nginx config, compose/pm2/mysql shims, listeners and a project folder with
# canary .env files (see scripts/fake-server/Dockerfile). The test then runs
# the dev CLI the way a user would, through a temporary ssh config and a
# temporary HOME (nothing of the real ~/.ssh is read):
#
#   hosts      the ssh config, with the entries left out and why
#   discover   a host key not accepted yet shows the server's real fingerprint
#              and how to accept it, and the run ends (not stuck); a wrong key
#              is SshAuth; a closed port is SshUnreachable; known_hosts is
#              never written by the app
#   discover   against the server: login test, nginx/compose/pm2/database/.env
#              paths/ports, suggested projects, saved to projects.json
#   scan       the saved projects.json scans successfully
#
# and checks that no CANARY value reaches any output, the config folder or the
# snapshots, and that the server's home and /tmp hash the same afterwards.
set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)
here="$root/scripts/fake-server"

for tool in docker jq ssh ssh-keygen ssh-keyscan; do
	command -v "$tool" >/dev/null 2>&1 || {
		echo "e2e: $tool is needed" >&2
		exit 2
	}
done

work=$(mktemp -d)
name="daminus-fake-server-$$"
cleanup() {
	docker rm -f "$name" >/dev/null 2>&1 || true
	rm -rf "$work"
}
trap cleanup EXIT INT TERM

fail=0
problem() {
	echo "FAIL: $*" >&2
	fail=1
}

# has TEXT NEEDLE: the text contains the fixed string; has_re: the pattern.
has() { printf '%s\n' "$1" | grep -qF -- "$2"; }
has_re() { printf '%s\n' "$1" | grep -q -- "$2"; }
# same_sum FILE SUM: the file still has the checksum it had.
same_sum() { [ "$(cksum <"$1")" = "$2" ]; }

# ok LABEL COMMAND…: the command succeeds.
ok() {
	label=$1
	shift
	if "$@"; then
		echo "ok: $label"
	else
		problem "$label"
	fi
}

cargo build -q -p daminus-core --features cli --bin daminus-dev
dev="$root/target/debug/daminus-dev"
docker build -q -f "$here/Dockerfile" -t daminus-fake-server "$root/scripts" >/dev/null

# The app's own home: no ~/.ssh, no agent. Anything it reads or writes is
# here. (Only the app gets it: docker and cargo keep the real one.)
# HOME only moves what the app expands itself. OpenSSH takes `~` and its default
# IdentityFile and UserKnownHostsFile from the passwd entry, not from $HOME, so
# the test cannot lean on HOME to keep the real ~/.ssh out of it: every host of
# the config below names its own key, known_hosts file and no system one, and
# `isolated` checks that with `ssh -G` before anything connects.
mkdir -p "$work/home"
app() {
	env -u SSH_AUTH_SOCK HOME="$work/home" "$dev" "$@"
}

ssh-keygen -q -t ed25519 -N '' -C good -f "$work/id_good"
ssh-keygen -q -t ed25519 -N '' -C wrong -f "$work/id_wrong"
docker run -d --rm --name "$name" -p 127.0.0.1::22 \
	-e "AUTHORIZED_KEY=$(cat "$work/id_good.pub")" daminus-fake-server >/dev/null
port=$(docker port "$name" 22/tcp | head -n 1 | sed 's/.*://')
tries=0
until ssh-keyscan -T 2 -p "$port" -t ed25519 127.0.0.1 2>/dev/null | grep -q ssh-ed25519; do
	tries=$((tries + 1))
	if [ "$tries" -gt 30 ]; then
		docker logs "$name" >&2 || true
		echo "e2e: sshd did not come up" >&2
		exit 1
	fi
	sleep 1
done
want_fp=$(docker exec "$name" ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | awk '{ print "ED25519 " $2 }')
echo "server host key: $want_fp"

# What the server's files look like before anything runs (the same
# fingerprint of $HOME and /tmp the check harness uses).
server_hash() {
	docker exec "$name" sh -c '{ find /home/daminus /tmp -xdev -exec stat -c "%n %s %a %Y" {} + ; find /home/daminus /tmp -xdev -type f -exec sha256sum {} + ; } 2>/dev/null | sort | sha256sum'
}
before=$(server_hash)

# known_hosts as a user would have it after answering "yes" once in Terminal;
# written here by the test, never by the app.
ssh-keyscan -T 2 -p "$port" -t ed25519 127.0.0.1 2>/dev/null >"$work/known_hosts"
: >"$work/known_hosts.empty"
: >"$work/known_hosts.jump"
cat >"$work/ssh_config" <<EOF
Host fake-a
    HostName 127.0.0.1
    Port $port
    User daminus
    IdentityFile $work/id_good
    IdentitiesOnly yes
    UserKnownHostsFile $work/known_hosts
    GlobalKnownHostsFile /dev/null

Host fake-new
    HostName 127.0.0.1
    Port $port
    User daminus
    IdentityFile $work/id_good
    IdentitiesOnly yes
    UserKnownHostsFile $work/known_hosts.empty
    GlobalKnownHostsFile /dev/null

Host fake-wrongkey
    HostName 127.0.0.1
    Port $port
    User daminus
    IdentityFile $work/id_wrong
    IdentitiesOnly yes
    UserKnownHostsFile $work/known_hosts
    GlobalKnownHostsFile /dev/null

# The same server again, reached through fake-a as a jump host (it is the
# sshd on its own port 22, as seen from inside the container).
Host fake-jump
    HostName 127.0.0.1
    Port 22
    User daminus
    ProxyJump fake-a
    IdentityFile $work/id_good
    IdentitiesOnly yes
    UserKnownHostsFile $work/known_hosts.jump
    GlobalKnownHostsFile /dev/null

Host fake-down
    HostName 127.0.0.1
    Port 1
    User daminus
    IdentityFile $work/id_good
    IdentitiesOnly yes
    UserKnownHostsFile $work/known_hosts
    GlobalKnownHostsFile /dev/null

Host *.internal
    User nobody

Host bare
    User nobody

Match host somewhere exec "false"
    User other
EOF
cfg="$work/ssh_config"
# What ssh would use for each host, worked out without connecting: only the
# keys and known_hosts files of this test, and no agent identity.
isolated() {
	ssh -F "$cfg" -G "$1" | awk -v w="$work" '
		$1 == "identitiesonly" && $2 == "yes" { only = 1 }
		$1 == "globalknownhostsfile" && $2 != "/dev/null" { bad = 1 }
		$1 == "identityfile" || $1 == "userknownhostsfile" {
			for (i = 2; i <= NF; i++) if (index($i, w "/") != 1) bad = 1
		}
		END { exit !(only && !bad) }'
}
for h in fake-a fake-new fake-wrongkey fake-jump fake-down; do
	ok "$h reads only this test's keys and known_hosts files" isolated "$h"
done
known_before=$(cksum <"$work/known_hosts")
empty_before=$(cksum <"$work/known_hosts.empty")

# ------------------------------------------------------------------- hosts
out=$(app -F "$cfg" hosts)
echo "$out"
ok "hosts lists the five servers" has_re "$out" "^5 host(s)"
ok "hosts shows the jump host" has "$out" "via fake-a"
ok "hosts says why entries are left out: wildcard" has "$out" "wildcard"
ok "hosts says why entries are left out: no HostName" has "$out" "no HostName"
ok "hosts says why entries are left out: match block" has "$out" "match block"
mkdir -p "$work/nohome"
empty=$(env -u SSH_AUTH_SOCK HOME="$work/nohome" "$dev" hosts)
ok "no ssh config at all is the empty state" has "$empty" "no ssh config file"

# -------------------------------------------------- host key, auth, network
start=$(date +%s)
rc=0
out=$(app -F "$cfg" --config-dir "$work/cfg-new" discover --host fake-new 2>&1) || rc=$?
took=$(($(date +%s) - start))
echo "$out"
ok "an unknown host key ends the run, it is not stuck (${took} s)" test "$rc" -ne 0 -a "$took" -lt 60
ok "it shows the server's real fingerprint" has "$out" "host key not accepted yet: $want_fp"
ok "it says how to accept it" has "$out" "ssh -F $cfg fake-new"
ok "the app wrote no known_hosts (the empty file is unchanged)" same_sum "$work/known_hosts.empty" "$empty_before"
ok "the app created no .ssh under its HOME variable" test ! -e "$work/home/.ssh"

rc=0
out=$(app -F "$cfg" --config-dir "$work/cfg-wrong" discover --host fake-wrongkey 2>&1) || rc=$?
echo "$out"
ok "a wrong key is SshAuth" has "$out" "[SshAuth]"
ok "and the run still ends non-zero" test "$rc" -ne 0

# Through a jump host ssh-keyscan cannot ask the server (it ignores ProxyJump),
# so the fingerprint comes from the route the login itself takes.
rc=0
out=$(app -F "$cfg" --config-dir "$work/cfg-jump" discover --host fake-jump 2>&1) || rc=$?
echo "$out"
ok "through a jump host an unknown key still shows the fingerprint" has "$out" "host key not accepted yet: $want_fp"
sed "s/^\[127.0.0.1\]:$port /127.0.0.1 /" "$work/known_hosts" >"$work/known_hosts.jump"
rc=0
out=$(app -F "$cfg" --config-dir "$work/cfg-jump" discover --host fake-jump --dry-run 2>&1) || rc=$?
echo "$out"
ok "once the key is accepted the host is reached through the jump host" has_re "$out" "fake-jump .* reached"
ok "and discover works there" test "$rc" -eq 0

rc=0
out=$(app -F "$cfg" --config-dir "$work/cfg-down" discover --host fake-down 2>&1) || rc=$?
echo "$out"
ok "a closed port is SshUnreachable" has "$out" "[SshUnreachable]"

# ---------------------------------------------------------------- discover
rc=0
out=$(app -F "$cfg" --config-dir "$work/cfg-a" discover --host fake-a \
	--path /home/daminus/app --path /root --database shop-x=shop 2>&1) || rc=$?
echo "$out"
ok "discover against the server succeeds" test "$rc" -eq 0
ok "the login test says who the user is" has_re "$out" "Linux .* as daminus"
ok "it knows docker answers" has "$out" "docker ok"
ok "it knows a folder is denied" has "$out" "folder /root Denied"
ok "it says another user's pm2 daemon cannot be listed" has "$out" "pm2 daemon /root/.pm2 belongs to another user"
ok "it saved projects.json" test -s "$work/cfg-a/projects.json"

p="$work/cfg-a/projects.json"
# shellcheck disable=SC2016 # jq programs
ok "shop-x: both URLs, the code folder, compose, both pm2 apps, the database" jq -e '
	(.projects | map(select(.id == "shop-x")) | length) == 1
	and (.projects[] | select(.id == "shop-x")
		| (.urls | sort) == ["https://api.shop-x.test", "https://shop-x.test"]
		and ([.components[] | select(.kind == "path")] | map(.path) == ["/home/daminus/app"])
		and ([.components[] | select(.kind == "compose")] | map(.project) == ["shop"])
		and ([.components[] | select(.kind == "pm2")] | map(.app) | sort == ["api", "queue"])
		and ([.components[] | select(.kind == "db")]
			== [{"role": "db", "host": "fake-a", "kind": "db", "engine": "mysql", "database": "shop",
				"env_file": "/home/daminus/app/.env", "container": "shop-db-1"}]))' "$p"
# shellcheck disable=SC2016 # jq programs
ok "blog.test is its own project, the host is listed" jq -e '
	(.projects[] | select(.id == "blog") | .urls == ["http://blog.test"]
		and .components == [{"role": "fe", "host": "fake-a", "kind": "path", "path": "/home/daminus/clean"}])
	and .hosts["fake-a"].include == true' "$p"
ok "no secret value is in projects.json" test -z "$(grep CANARY "$p" || true)"

# The same discover again is a replace, not a second copy.
app -F "$cfg" --config-dir "$work/cfg-a" discover --host fake-a --database shop-x=shop >"$work/again.txt" 2>&1
# shellcheck disable=SC2016 # jq programs
ok "running it again keeps two projects" jq -e '.projects | length == 2' "$p"

# -------------------------------------------------------------------- scan
echo "== scan"
if app -F "$cfg" --config-dir "$work/cfg-a" scan >"$work/scan.txt" 2>"$work/scan.err"; then
	cat "$work/scan.txt"
	ok "the saved projects.json scans" test -s "$work/scan.txt"
else
	cat "$work/scan.err" "$work/scan.txt" >&2
	problem "scan failed on the projects discover saved"
fi
app --config-dir "$work/cfg-a" report >"$work/report.json"
# shellcheck disable=SC2016 # jq programs
ok "the scan checked the discovered components" jq -e '
	[.items[] | select(.key.host == "fake-a") | .key.check] as $c
	| ($c | index("docker.compose")) != null and ($c | index("pm2.app")) != null
	and ($c | index("db.size")) != null and ($c | index("disk.path")) != null' "$work/report.json"
# shellcheck disable=SC2016 # jq programs
ok "and the mariadbd that listens on every address is a finding" jq -e '
	[.items[] | select(.key.check == "sec.ports" and .key.target == "3306")] | length == 1' "$work/report.json"

# ------------------------------------------------------- secrets and files
leaks=$(grep -rl CANARY "$work/cfg-a" "$work/cfg-new" "$work/cfg-wrong" "$work/cfg-down" "$work/cfg-jump" \
	"$work/again.txt" "$work/scan.txt" "$work/scan.err" "$work/report.json" 2>/dev/null || true)
ok "no canary value reached any output, config folder or snapshot" test -z "$leaks"
[ -z "$leaks" ] || echo "$leaks" >&2
ok "known_hosts files are untouched" same_sum "$work/known_hosts" "$known_before"
after=$(server_hash)
ok "the server's home and /tmp are byte for byte the same" test "$before" = "$after"

if [ "$fail" -ne 0 ]; then
	docker logs "$name" 2>&1 | tail -n 20 >&2 || true
	exit 1
fi
echo "fake server e2e: ok"
