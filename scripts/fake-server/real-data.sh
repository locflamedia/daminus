#!/bin/sh
# Real scans of the fake server for the result screens: starts the Docker sshd of this folder,
# discovers it, saves the projects, scans it a few times and exports what the history screens
# read as local-real/bundle.json (git-ignored). Then open the app in a browser with
# `?mock=real`. Nothing of the real ~/.ssh is read; no real server is contacted.
#
#   scripts/fake-server/real-data.sh [scans]     (default 3)
set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)
here="$root/scripts/fake-server"
scans=${1:-3}

for tool in docker ssh ssh-keygen ssh-keyscan; do
	command -v "$tool" >/dev/null 2>&1 || {
		echo "real-data: $tool is needed" >&2
		exit 2
	}
done

work=$(mktemp -d)
name="daminus-real-data-$$"
cleanup() {
	docker rm -f "$name" >/dev/null 2>&1 || true
	rm -rf "$work"
}
trap cleanup EXIT INT TERM

cargo build -q -p daminus-core --features cli --bin daminus-dev
dev="$root/target/debug/daminus-dev"
docker build -q -f "$here/Dockerfile" -t daminus-fake-server "$root/scripts" >/dev/null

mkdir -p "$work/home"
ssh-keygen -q -t ed25519 -N '' -C good -f "$work/id_good"
docker run -d --rm --name "$name" -p 127.0.0.1::22 \
	-e "AUTHORIZED_KEY=$(cat "$work/id_good.pub")" daminus-fake-server >/dev/null
port=$(docker port "$name" 22/tcp | head -n 1 | sed 's/.*://')
tries=0
until ssh-keyscan -T 2 -p "$port" -t ed25519 127.0.0.1 2>/dev/null | grep -q ssh-ed25519; do
	tries=$((tries + 1))
	[ "$tries" -gt 30 ] && {
		echo "real-data: sshd did not come up" >&2
		exit 1
	}
	sleep 1
done
ssh-keyscan -T 2 -p "$port" -t ed25519 127.0.0.1 2>/dev/null >"$work/known_hosts"
cat >"$work/ssh_config" <<EOC
Host fake-a
    HostName 127.0.0.1
    Port $port
    User daminus
    IdentityFile $work/id_good
    IdentitiesOnly yes
    UserKnownHostsFile $work/known_hosts
    GlobalKnownHostsFile /dev/null
EOC

app() {
	env -u SSH_AUTH_SOCK HOME="$work/home" "$dev" --config-dir "$work/config" -F "$work/ssh_config" "$@"
}

app discover --host fake-a --database shop-x=shop >/dev/null
i=0
while [ "$i" -lt "$scans" ]; do
	app scan >/dev/null
	i=$((i + 1))
done
mkdir -p "$root/local-real"
app history-json >"$root/local-real/bundle.json"
echo "real-data: $scans scans exported to local-real/bundle.json (open the app with ?mock=real)"
