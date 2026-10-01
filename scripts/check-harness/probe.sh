#!/bin/sh
# Runs inside the harness container (see run.sh): the bundle arrives on stdin.
# Hashes $HOME and /tmp (names, sizes, modes, mtimes and contents) before and
# after `sh -s`, and prints both hashes on stderr. The bundle's own stderr is
# merged into stdout, so anything it printed there fails validation.
#
# ~/.pm2 gets a stand-in daemon: a process titled as pm2 titles its daemon.
# storage/logs gets a sparse 600 MiB log for logs.big.
#
# With PLANT=1 the container also looks compromised, for the security checks:
#   - a miner (a copy of the shell named xmrig) runs from /tmp, with a canary
#     on its command line, which no check may ever print;
#   - a hidden job runs from /tmp/.hidden-job, and its file is then deleted;
#   - a listener holds the database ports 6379 and 3306 on all addresses, and
#     8080, which is not one of them;
#   - executables sit in /tmp (the miner) and /dev/shm.
# They are in place before the first hash and stopped after the second.
# /etc/ld.so.preload is a bind mount made by run.sh.

truncate -s 600M "$HOME/app/storage/logs/laravel.log"
sh -c "sleep 600; :" "PM2 v5.4.2: God Daemon ($HOME/.pm2)" </dev/null &
daemon=$!
printf %s "$daemon" >"$HOME/.pm2/pm2.pid"
: >"$HOME/.pm2/rpc.sock"
: >"$HOME/.pm2/pub.sock"

planted=""
if [ -n "${PLANT-}" ]; then
	cp /bin/sh /tmp/xmrig
	/tmp/xmrig -c "sleep 600; :" CANARY_miner_argv_4e1b </dev/null >/dev/null 2>&1 &
	planted="$!"
	cp /bin/sh /tmp/.hidden-job
	/tmp/.hidden-job -c "sleep 600; :" </dev/null >/dev/null 2>&1 &
	planted="$planted $!"
	perl -e '
		use Socket;
		my @held;
		for my $port (6379, 3306, 8080) {
			socket(my $s, PF_INET, SOCK_STREAM, 0) or die;
			bind($s, sockaddr_in($port, INADDR_ANY)) or die;
			listen($s, 5) or die;
			push @held, $s;
		}
		sleep 600;
	' </dev/null >/dev/null 2>&1 &
	planted="$planted $!"
	# Let them start, then delete the hidden job's file while it runs.
	sleep 1
	rm /tmp/.hidden-job
	cp /bin/sh /dev/shm/kinsing
fi

snap() {
	find "$HOME" /tmp -xdev -exec stat -c "%n %s %a %Y" {} + 2>/dev/null | sort
	find "$HOME" /tmp -xdev -type f -exec sha256sum {} + 2>/dev/null | sort
}
before=$(snap | sha256sum)
sh -s 2>&1
after=$(snap | sha256sum)
kill "$daemon"
# shellcheck disable=SC2086 # a list of process ids
[ -z "$planted" ] || kill $planted
printf "%s\n%s\n" "$before" "$after" >&2
