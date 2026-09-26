# pm2.app: status, restarts, instances and memory of each pm2 app on this
# host (DAMINUS_PM2: the app name, then a tab and PM2_HOME when the
# component names one; otherwise $PM2_HOME or ~/.pm2 of the SSH user).
#
# `pm2 jlist` is only called when the daemon of that PM2_HOME runs (pm2.pid
# names a live process) and its sockets are ours to use: otherwise pm2 would
# start a new daemon, which writes PM2_HOME. Only name, pm_id, status,
# restart_time, pm_uptime and monit.memory are read from its output
# (pm2_rows); the process environment it carries is never printed. A
# PM2_HOME of another user gives Unknown(needs_perm).

[ -n "${DAMINUS_PM2-}" ] || exit 0

# pm2 is often installed with nvm, whose bin folder a non-interactive SSH
# session does not have on PATH (node comes from the same folder).
for d in "$HOME"/.nvm/versions/node/*/bin /usr/local/lib/nodejs/*/bin; do
	[ -d "$d" ] && PATH="$PATH:$d"
done
export PATH

# The SSH user's own daemon, for entries that name no PM2_HOME. An entry's
# PM2_HOME is only set inside the subshell of its own pm2 call, so it cannot
# change the daemon a later entry is checked against.
default_home=${PM2_HOME:-$HOME/.pm2}

# pm2 (a node start) runs once per daemon, however many of its apps are
# listed: `asked` holds "N TAB HOME" per PM2_HOME asked, `cache` the pm2_rows
# of each, every line prefixed with its N and a tab.
asked=""
nasked=0
cache=""
rows_for() {
	_n=""
	IFS=$NL
	for _l in $asked; do
		# shellcheck disable=SC2295
		if [ "${_l#*$TAB}" = "$1" ]; then
			_n=${_l%%$TAB*}
			break
		fi
	done
	unset IFS
	if [ -z "$_n" ]; then
		nasked=$((nasked + 1))
		_n=$nasked
		asked="$asked$_n$TAB$1$NL"
		_r=$(
			PM2_HOME=$1
			export PM2_HOME
			run_light pm2 jlist | pm2_rows
		)
		cache="$cache$(printf '%s\n' "$_r" | awk -v n="$_n" 'NF { print n "\t" $0 }')$NL"
	fi
	rows=$(printf '%s' "$cache" | awk -v n="$_n" 'index($0, n "\t") == 1 { print substr($0, length(n) + 2) }')
}

set -f
IFS=$NL
for entry in $DAMINUS_PM2; do
	unset IFS
	[ -n "$entry" ] || continue
	# shellcheck disable=SC2295
	app=${entry%%$TAB*}
	home=$default_home
	# shellcheck disable=SC2295
	[ "$entry" = "$app" ] || home=${entry#*$TAB}

	pm2_state "$home"
	case $? in
	0) ;;
	1)
		emit_unknown pm2.app "$app" missing
		continue
		;;
	2)
		perm_missing pm2.app "$app"
		continue
		;;
	*)
		# No daemon under this PM2_HOME: none of its apps runs.
		emit pm2.app "$app" "" "" "{\"status\":\"stopped\",\"daemon\":false,\"instances\":0,\"restarts\":0,\"mem_mb\":0}"
		continue
		;;
	esac
	if ! has pm2; then
		emit_unknown pm2.app "$app" missing
		continue
	fi

	rows_for "$home"
	data=$(printf '%s\n' "$rows" | awk -F '\t' -v app="$app" '
		function num(s) { return (s ~ /^[0-9]+$/) ? s : 0 }
		# Worst status first: an app is as healthy as its worst instance.
		function rank(s) {
			if (s == "errored") return 5
			if (s == "stopped") return 4
			if (s == "stopping" || s == "waiting restart" || s == "launching" || s == "one-launch-status") return 3
			if (s == "online") return 1
			return 2
		}
		$1 == app && NF == 6 {
			n++
			s = $3
			# Only pm2 own states; anything else is never passed on.
			if (s != "online" && s != "stopping" && s != "stopped" && s != "launching" && s != "errored" && s != "one-launch-status" && s != "waiting restart") s = "unknown"
			if (worst == "" || rank(worst) < rank(s)) worst = s
			rs += num($4)
			up = num($5); if (latest < up + 0) latest = up + 0
			mem += num($6)
			ids = ids (ids == "" ? "" : ",") num($2)
		}
		END {
			if (n == 0) exit
			printf "{\"status\":\"%s\",\"daemon\":true,\"instances\":%d,\"restarts\":%d,\"mem_mb\":%.0f,\"started\":%.0f,\"ids\":[%s]}\n", worst, n, rs, mem / 1048576, latest / 1000, ids
		}')
	if [ -z "$data" ]; then
		# The daemon runs but does not know the app (deleted or renamed).
		emit_unknown pm2.app "$app" missing
		continue
	fi
	emit pm2.app "$app" "" "" "$data"
done
