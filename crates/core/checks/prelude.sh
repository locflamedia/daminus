exec 2>/dev/null
# Daminus check prelude: the first part of every bundle. Helpers shared by all
# checks. Server stderr never reaches the Mac (line 1). Read-only: nothing in
# a bundle writes, deletes, restarts, installs or calls sudo.
#
# Output is NDJSON v1, one JSON object per line on stdout:
#   {"_":"begin","v":1,"bundle":"<hash>"}      opens the run
#   {"check":"sys.load","target":"",...}        one fact (see CheckFact)
#   {"_":"step","group":"system","ms":12}       a check group finished
#   {"_":"end"}                                 the run finished

LC_ALL=C
export LC_ALL
PATH="$PATH:/usr/sbin:/sbin:/usr/bin:/bin"
export PATH

# has CMD: the command exists.
has() {
	command -v "$1" >/dev/null 2>&1
}

# json_str S: S as a JSON string, quotes included. Backslash, quote, tab and
# newline are escaped; other control characters are dropped.
json_str() {
	case $1 in
	*[!A-Za-z0-9_./:@+=,%-]*) ;;
	*)
		printf '"%s"' "$1"
		return 0
		;;
	esac
	printf '%s' "$1" |
		tr -d '\000-\010\013-\037\177' |
		sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/	/\\t/g' |
		awk 'BEGIN { ORS = ""; printf "\"" } NR != 1 { printf "\\n" } { print } END { printf "\"" }'
}

# is_num S: S is a plain decimal number (optional minus, digits, one dot) that
# is also valid JSON, so no leading zero before another digit (01, 00.5).
is_num() {
	case ${1#-} in
	'' | *[!0-9.]* | *.*.* | .* | *. | 0[0-9]*) return 1 ;;
	esac
	return 0
}

# emit CHECK TARGET [VALUE UNIT [DATA [FP]]]: one fact line. DATA is a JSON
# object built by the check; a VALUE that is not a number drops the line.
emit() {
	_e="{\"check\":$(json_str "$1"),\"target\":$(json_str "$2")"
	if [ -n "${3-}" ]; then
		is_num "$3" || return 0
		_e="$_e,\"value\":$3,\"unit\":$(json_str "${4-}")"
	fi
	if [ -n "${5-}" ]; then
		_e="$_e,\"data\":$5"
	fi
	if [ -n "${6-}" ]; then
		_e="$_e,\"fp\":$(json_str "$6")"
	fi
	printf '%s}\n' "$_e"
}

# emit_unknown CHECK TARGET REASON [DATA]: the check could not answer. REASON
# is one of needs_perm, missing, unsupported, timeout. DATA is an optional
# JSON object that says how far it got (processes seen, say).
emit_unknown() {
	_d=""
	if [ -n "${4-}" ]; then
		_d=",\"data\":$4"
	fi
	printf '{"check":%s,"target":%s,"unknown":"%s"%s}\n' "$(json_str "$1")" "$(json_str "$2")" "$3" "$_d"
}

# perm_missing CHECK [TARGET]: the SSH user lacks a permission. Never sudo.
perm_missing() {
	emit_unknown "$1" "${2-}" needs_perm
}

# run_light CMD ARGS…: run a heavy read at the lowest CPU and IO priority,
# stopped after 20 s (exit 124). Each wrapper is used only when it works here.
# run_for SECS CMD ARGS…: the same, stopped after SECS (at most 20) seconds.
_light=""
if has nice && nice -n 19 true; then
	_light="nice -n 19"
fi
if has ionice && ionice -c3 true; then
	_light="$_light ionice -c3"
fi
_timeout=0
if has timeout && timeout -k 2 20 true; then
	_timeout=1
fi
run_for() {
	_s=$1
	shift
	[ "$_s" -le 20 ] || _s=20
	if [ "$_timeout" = 1 ]; then
		# shellcheck disable=SC2086 # $_light is a word list on purpose.
		$_light timeout -k 2 "$_s" "$@"
	else
		# shellcheck disable=SC2086 # $_light is a word list on purpose.
		$_light "$@"
	fi
}
run_light() {
	run_for 20 "$@"
}

# A literal tab: field separator for tool output (docker --format, pm2_rows).
# shellcheck disable=SC2034 # used by the check scripts
TAB=$(printf '\t')
# A newline, for splitting the newline-separated DAMINUS_* lists.
# shellcheck disable=SC2034 # used by the check scripts
NL='
'

# docker_ok: whether the docker daemon answers. Returns 0 when it does, 1
# when docker is not installed or no daemon runs, 2 when the socket is there
# but the SSH user may not use it (not in the docker group). The optional
# argument is the most seconds the daemon is asked for (default 20).
docker_ok() {
	has docker || return 1
	if run_for "${1:-20}" docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
		return 0
	fi
	if [ -S /var/run/docker.sock ] && [ ! -w /var/run/docker.sock ]; then
		return 2
	fi
	return 1
}

# pm2_state HOME: whether `pm2 jlist` may be asked about the daemon of
# PM2_HOME=HOME without side effects. Prints nothing. Returns 0 when the
# daemon runs and its sockets are ours to use; 1 when HOME does not exist;
# 2 when HOME or its sockets belong to another user; 3 when no daemon runs.
# pm2 starts a daemon (and writes HOME) when none answers, so jlist is only
# called on 0.
pm2_state() {
	if [ ! -e "$1" ]; then
		# Inside another user's closed home it cannot even be seen.
		_up=${1%/*}
		if [ -n "$_up" ] && [ -d "$_up" ] && [ ! -x "$_up" ]; then return 2; fi
		return 1
	fi
	if [ ! -r "$1" ] || [ ! -x "$1" ]; then return 2; fi
	[ -e "$1/pm2.pid" ] || return 3
	[ -r "$1/pm2.pid" ] || return 2
	# pm2 writes the pid without a newline, so read reports end of file.
	_pid=""
	read -r _pid <"$1/pm2.pid"
	case $_pid in '' | *[!0-9]*) return 3 ;; esac
	# The pid must still be this PM2_HOME's daemon: after a crash or an
	# unclean reboot pm2.pid and the sockets stay behind and the pid may now
	# be another process. pm2 titles its daemon "PM2 vX: God Daemon (HOME)";
	# node may cut a long title short, so HOME) only has to start with what
	# follows "God Daemon (".
	_args=""
	if [ -d /proc/self ]; then
		if [ -d "/proc/$_pid" ]; then
			_args=$(tr '\000' ' ' <"/proc/$_pid/cmdline")
		fi
	elif ps -p "$_pid" >/dev/null 2>&1; then
		_args=$(ps -o args= -p "$_pid")
	fi
	if [ -z "$_args" ]; then
		# Not visible. With /proc mounted hidepid, another user's daemon is
		# hidden from us even when it runs: that is a permission gap, not an
		# outage. Our own processes are never hidden, so for our HOME it is gone.
		# shellcheck disable=SC3067 # -O is in dash, bash, ash and ksh.
		if [ ! -O "$1" ] && awk '$2 == "/proc" && $4 ~ /(^|,)hidepid=([12]|invisible|noaccess)(,|$)/ { f = 1 } END { exit !f }' /proc/mounts; then
			return 2
		fi
		return 3
	fi
	case $_args in *"God Daemon ("*) ;; *) return 3 ;; esac
	_title=${_args#*God Daemon (}
	while :; do
		case $_title in *" ") _title=${_title% } ;; *) break ;; esac
	done
	case "${1%/})" in "$_title"*) ;; *) return 3 ;; esac
	if [ ! -e "$1/rpc.sock" ] || [ ! -e "$1/pub.sock" ]; then return 3; fi
	if [ ! -w "$1/rpc.sock" ] || [ ! -w "$1/pub.sock" ]; then return 2; fi
	return 0
}

# pm2_rows: reads `pm2 jlist` on stdin and prints one line per process:
# name TAB pm_id TAB status TAB restart_time TAB pm_uptime TAB memory.
# Only these fields are read, by position in the JSON (top-level name and
# pm_id, pm2_env.status/restart_time/pm_uptime, monit.memory); everything
# else, the process environment first of all, is never printed. pm2 writes
# its own fields before the app environment it merges into pm2_env, so only
# the first occurrence of a key counts. Strings are
# split on quotes, so an escaped quote inside a value cannot end it early.
pm2_rows() {
	awk 'f || /^[[:space:]]*\[/ { f = 1; print }' | awk '
		BEGIN { RS = "\""; depth = 0; instr = 0; had = 0 }
		function keep(k, v) {
			if (depth == 2 && k == "name") name = v
			else if (depth == 2 && k == "pm_id") id = v
			else if (depth == 3 && parent[3] == "pm2_env" && k == "status" && st == "") st = v
			else if (depth == 3 && parent[3] == "pm2_env" && k == "restart_time" && rs == "") rs = v
			else if (depth == 3 && parent[3] == "pm2_env" && k == "pm_uptime" && up == "") up = v
			else if (depth == 3 && parent[3] == "monit" && k == "memory" && mem == "") mem = v
		}
		function scalar() {
			if (tok != "") { keep(key, tok); key = ""; tok = "" }
		}
		instr {
			acc = acc $0
			n = 0
			for (i = length($0); i && substr($0, i, 1) == "\\"; i--) n++
			if (n % 2 == 1) { acc = acc "\""; next }
			instr = 0; str = acc; had = 1
			next
		}
		{
			t = $0
			if (had) {
				had = 0
				if (t ~ /^[ \t\r\n]*:/) { key = str; sub(/^[ \t\r\n]*:/, "", t) }
				else { keep(key, str); key = "" }
			}
			for (i = 1; i <= length(t); i++) {
				c = substr(t, i, 1)
				if (c == "{" || c == "[") {
					scalar(); depth++; parent[depth] = key; key = ""
					if (depth == 2) { name = ""; id = ""; st = ""; rs = ""; up = ""; mem = "" }
				} else if (c == "}" || c == "]") {
					scalar()
					if (depth == 2 && c == "}") print name "\t" id "\t" st "\t" rs "\t" up "\t" mem
					depth--; key = ""
				} else if (c == ",") {
					scalar(); key = ""
				} else if (c != " " && c != "\t" && c != "\r" && c != "\n") {
					tok = tok c
				}
			}
			instr = 1; acc = ""
		}
	'
}

# find_ok: find understands what the security checks use (GNU find: -printf,
# -lname and -perm /MODE). Busybox and BSD find do not, and a check that ran
# them anyway would see nothing and call that clean.
find_ok() {
	find / -maxdepth 0 -perm /111 -lname x -printf '' >/dev/null 2>&1
}

# sha12 FILE: the first 12 hex digits of the SHA-256 of FILE's first MiB, or
# `-` when the file cannot be read or the server has no SHA-256 tool. Part of
# the evidence fingerprint of file findings: size:mtime:sha12.
sha12() {
	if [ ! -r "$1" ]; then
		printf -- '-'
		return 0
	fi
	_h=""
	if has sha256sum; then
		_h=$(head -c 1048576 "$1" | sha256sum)
	elif has shasum; then
		_h=$(head -c 1048576 "$1" | shasum -a 256)
	fi
	_h=${_h%% *}
	case $_h in
	????????????*) printf '%.12s' "$_h" ;;
	*) printf -- '-' ;;
	esac
}

# sha12_text TEXT: the first 12 hex digits of the SHA-256 of TEXT and a
# newline, or nothing when the server has no SHA-256 tool.
sha12_text() {
	_h=""
	if has sha256sum; then
		_h=$(printf '%s\n' "$1" | sha256sum)
	elif has shasum; then
		_h=$(printf '%s\n' "$1" | shasum -a 256)
	fi
	_h=${_h%% *}
	case $_h in
	????????????*) printf '%.12s' "$_h" ;;
	esac
}

# file_fp SIZE MTIME FILE: the evidence fingerprint of one file, as
# size:mtime:sha12 (mtime in whole seconds).
file_fp() {
	_m=${2%%.*}
	is_num "$_m" || _m=0
	printf '%s:%s:%s' "$1" "$_m" "$(sha12 "$3")"
}

# top_recent N: reads `SIZE TAB MTIME TAB PATH` lines (find -printf '%s\t%T@\t%p\n')
# and prints how many there were, then the N newest, newest first. Lines that
# do not start with two numbers (a file name holding a newline) are dropped.
top_recent() {
	awk -F '\t' -v keep="$1" '
		$1 ~ /^[0-9]+$/ && $2 ~ /^[0-9.]+$/ { n++; m[n] = $2 + 0; line[n] = $0 }
		END {
			print n + 0
			for (k = 1; k <= keep; k++) {
				best = 0
				for (i = 1; i <= n; i++) if (!(i in taken) && (best == 0 || m[best] < m[i])) best = i
				if (best == 0) break
				taken[best] = 1
				print line[best]
			}
		}'
}

# skip_expr [NAME…]: the find expression that prunes the folders listed in
# DAMINUS_SKIP_PATHS and the extra bare NAMEs given, one word per line, empty
# when there is nothing to skip. A bare name matches at any depth, a relative
# path as a suffix, an absolute one exactly. Use:
#   IFS=$NL; set -f; set -- $(skip_expr vendor); unset IFS
#   find DIR "$@" -type f ...
skip_expr() {
	set -f
	_b=""
	for _x in "$@"; do
		_b="$_b${_b:+$NL-o$NL}-name$NL$_x"
	done
	IFS=$NL
	for _x in ${DAMINUS_SKIP_PATHS-}; do
		unset IFS
		if [ -n "$_x" ]; then
			case $_x in
			/*) _t="-path$NL$_x" ;;
			*/*) _t="-path$NL*/$_x" ;;
			*) _t="-name$NL$_x" ;;
			esac
			_b="$_b${_b:+$NL-o$NL}$_t"
		fi
		IFS=$NL
	done
	unset IFS
	if [ -n "$_b" ]; then
		printf '(\n%s\n)\n-prune\n-o\n' "$_b"
	fi
}

# now_ms: wall clock in milliseconds (seconds × 1000 where %N is missing).
now_ms() {
	_t=$(date +%s%N)
	case $_t in
	'' | *[!0-9]*) printf '%s000' "$(date +%s)" ;;
	*) printf '%s' "$((_t / 1000000))" ;;
	esac
}

# group_left SECS: whole seconds left of a SECS-second allowance that began
# with the current check group (d_group); 0 once it is spent. Checks that walk
# several folders share it, so the group cannot eat the host budget.
# DISK_GROUP_S: the allowance of the disk group (disk.fs, logs.big,
# disk.path), under half the host budget so the checks after it still run.
# shellcheck disable=SC2034 # used by the check scripts
DISK_GROUP_S=40
# SEC_GROUP_S: the same for the security group (miner, uploads, temp, preload,
# ports) and for the code-changes group.
# shellcheck disable=SC2034 # used by the check scripts
SEC_GROUP_S=30
group_left() {
	_now=$(now_ms)
	_left=$(($1 - (_now - ${_g0:-$_now}) / 1000))
	[ "$_left" -gt 0 ] || _left=0
	printf '%s' "$_left"
}

d_begin() {
	printf '{"_":"begin","v":1,"bundle":%s}\n' "$(json_str "${DAMINUS_BUNDLE-}")"
}

d_group() {
	_g0=$(now_ms)
}

d_step() {
	_g1=$(now_ms)
	_ms=$((_g1 - _g0))
	[ "$_ms" -ge 0 ] || _ms=0
	printf '{"_":"step","group":%s,"ms":%s}\n' "$(json_str "$1")" "$_ms"
}

d_end() {
	printf '{"_":"end"}\n'
}
