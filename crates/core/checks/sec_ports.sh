# sec.ports: database and Docker ports that accept connections from any
# address. Reads the kernel's table of listening TCP sockets (/proc/net/tcp
# and tcp6, no `ss` needed) and reports 3306 (MySQL), 5432 (Postgres), 6379
# (Redis), 27017 (MongoDB) and 2375 (Docker without TLS) when they are bound
# to 0.0.0.0 or ::. One fact per port (target = the port number, data = the
# port and the name of the process holding it); when there is none, one fact
# with an empty target and value 0. The process is found through the socket
# links under /proc/PID/fd, which the SSH user can read for its own
# processes only: a port held by someone else's process has an empty name.
# DAMINUS_PROC lets tests point at another /proc; the app never sets it.

proc=${DAMINUS_PROC:-/proc}
if [ ! -r "$proc/net/tcp" ]; then
	emit_unknown sec.ports "" unsupported
	exit 0
fi

# One line per risky listener: port TAB socket inode.
listen=""
for t in tcp tcp6; do
	[ -r "$proc/net/$t" ] || continue
	rows=$(awk '
		BEGIN {
			ports["0CEA"] = 3306; ports["1538"] = 5432; ports["18EB"] = 6379
			ports["6989"] = 27017; ports["0947"] = 2375
		}
		$4 == "0A" {
			split($2, a, ":")
			if (a[1] != "00000000" && a[1] != "00000000000000000000000000000000") next
			p = toupper(a[2])
			if (p in ports) print ports[p] "\t" $10
		}' "$proc/net/$t")
	[ -z "$rows" ] || listen="$listen${listen:+$NL}$rows"
done
if [ -z "$listen" ]; then
	emit sec.ports "" 0 count
	exit 0
fi

# Who holds them: every socket link under /proc/PID/fd, matched to the
# inodes above. Output: port TAB pid (pid empty when not visible), once per port.
socks=""
if find_ok; then
	left=$(group_left "$SEC_GROUP_S")
	if [ "$left" -ge 2 ]; then
		socks=$(run_for "$left" find "$proc" -maxdepth 3 -path "$proc/[0-9]*/fd/*" -lname 'socket:*' -printf '%l\t%P\n')
	fi
fi
holders=$({
	printf '%s\n--\n' "$listen"
	printf '%s\n' "$socks"
} | awk -F '\t' '
	$0 == "--" { second = 1; next }
	!second {
		if (!($1 in order)) { n++; list[n] = $1; order[$1] = n }
		want[$2] = $1
		next
	}
	{
		ino = $1
		sub(/^socket:\[/, "", ino)
		sub(/\]$/, "", ino)
		if (ino in want && !(want[ino] in pid)) {
			split($2, p, "/")
			pid[want[ino]] = p[1]
		}
	}
	END { for (i = 1; i <= n; i++) print list[i] "\t" pid[list[i]] }')

IFS=$NL
for row in $holders; do
	unset IFS
	# shellcheck disable=SC2295
	port=${row%%$TAB*}
	# shellcheck disable=SC2295
	pid=${row#*$TAB}
	is_num "$port" || continue
	name=""
	case $pid in
	'' | *[!0-9]*) ;;
	*) read -r name <"$proc/$pid/comm" ;;
	esac
	emit sec.ports "$port" "" "" "{\"port\":$port,\"proc\":$(json_str "$name")}" "$port/$name"
	IFS=$NL
done
