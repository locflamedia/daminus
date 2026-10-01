#!/bin/sh
# Runs as the ssh user: the processes a real server would have. Its own pm2
# daemon, titled the way pm2 titles it, with the pid file and sockets pm2
# leaves; a process named "mariadbd" holding 3306 on every address; Postgres'
# port on 127.0.0.1 only; an app server on 127.0.0.1:3000 started from the
# project folder (nginx proxies to it).
set -eu
cd "$HOME"

nohup sh -c 'sleep 31536000; :' "PM2 v5.4.2: God Daemon ($HOME/.pm2)" </dev/null >/dev/null 2>&1 &
printf %s "$!" >"$HOME/.pm2/pm2.pid"
: >"$HOME/.pm2/rpc.sock"
: >"$HOME/.pm2/pub.sock"

# The kernel names a process after its executable: a copy of perl is mariadbd.
mkdir -p "$HOME/bin"
cp /usr/bin/perl "$HOME/bin/mariadbd"
nohup "$HOME/bin/mariadbd" /opt/fake-server/listen.pl 0.0.0.0:3306 </dev/null >/dev/null 2>&1 &
nohup perl /opt/fake-server/listen.pl 127.0.0.1:5432 </dev/null >/dev/null 2>&1 &
(cd "$HOME/app" && nohup perl /opt/fake-server/listen.pl 127.0.0.1:3000 </dev/null >/dev/null 2>&1 &)
