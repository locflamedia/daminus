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

# emit_unknown CHECK TARGET REASON: the check could not answer. REASON is one
# of needs_perm, missing, unsupported, timeout.
emit_unknown() {
	printf '{"check":%s,"target":%s,"unknown":"%s"}\n' "$(json_str "$1")" "$(json_str "$2")" "$3"
}

# perm_missing CHECK [TARGET]: the SSH user lacks a permission. Never sudo.
perm_missing() {
	emit_unknown "$1" "${2-}" needs_perm
}

# run_light CMD ARGS…: run a heavy read at the lowest CPU and IO priority,
# stopped after 20 s (exit 124). Each wrapper is used only when it works here.
_light=""
if has nice && nice -n 19 true; then
	_light="nice -n 19"
fi
if has ionice && ionice -c3 true; then
	_light="$_light ionice -c3"
fi
if has timeout && timeout -k 2 20 true; then
	_light="$_light timeout -k 2 20"
fi
run_light() {
	# shellcheck disable=SC2086 # $_light is a word list on purpose.
	$_light "$@"
}

# now_ms: wall clock in milliseconds (seconds × 1000 where %N is missing).
now_ms() {
	_t=$(date +%s%N)
	case $_t in
	'' | *[!0-9]*) printf '%s000' "$(date +%s)" ;;
	*) printf '%s' "$((_t / 1000000))" ;;
	esac
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
