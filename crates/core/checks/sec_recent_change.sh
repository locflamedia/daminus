# sec.recent_change: code files changed in the last 3 days, for the reader
# (and the AI) to judge: a deploy explains a burst of changes, nothing else
# does. Counts files with a code extension under each project folder on this
# host (DAMINUS_PATHS), skipping vendor, node_modules, storage and .git
# folders and the Settings › Scan skip paths. One fact per folder (target =
# the folder, value = how many files, data = the newest change time and the
# 10 newest files as [path relative to the folder, mtime], fp = SHA-256 of
# the sorted list of file names). Only listed, never opened.

[ -n "${DAMINUS_PATHS-}" ] || exit 0
if ! find_ok; then
	emit_unknown sec.recent_change "" unsupported
	exit 0
fi

IFS=$NL
set -f
# shellcheck disable=SC2046 # split on newlines only, with globbing off
set -- $(skip_expr vendor node_modules storage .git)
unset IFS
IFS=$NL
for path in $DAMINUS_PATHS; do
	unset IFS
	[ -n "$path" ] || continue
	if [ ! -d "$path" ]; then
		emit_unknown sec.recent_change "$path" missing
		IFS=$NL
		continue
	fi
	if [ ! -r "$path" ] || [ ! -x "$path" ]; then
		perm_missing sec.recent_change "$path"
		IFS=$NL
		continue
	fi
	left=$(group_left "$SEC_GROUP_S")
	if [ "$left" -lt 2 ]; then
		emit_unknown sec.recent_change "$path" timeout
		IFS=$NL
		continue
	fi
	# mtime TAB path relative to the folder, one file a line.
	found=$(run_for "$left" find "$path" -xdev "$@" -type f -mtime -3 "(" -name '*.php' -o -name '*.phtml' -o -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' -o -name '*.vue' -o -name '*.py' -o -name '*.rb' -o -name '*.pl' -o -name '*.cgi' -o -name '*.sh' -o -name '*.jsp' -o -name '*.asp' -o -name '*.aspx' -o -name '*.html' -o -name '*.htm' -o -name '.htaccess' ")" -printf '%T@\t%P\0' | tr '\012\000' '?\012')
	# A find stopped at its time limit leaves nothing of the allowance.
	if [ "$(group_left "$SEC_GROUP_S")" -lt 1 ]; then
		emit_unknown sec.recent_change "$path" timeout
		IFS=$NL
		continue
	fi
	# The count, the newest time and the ten newest, from `mtime TAB name` lines.
	summary=$(printf '%s\n' "$found" | awk -F '\t' '
		# A JSON string without escapes: quotes and backslashes become ?,
		# control characters are dropped.
		function jstr(s) {
			gsub(/[\\"]/, "?", s); gsub(/[[:cntrl:]]/, "", s)
			return "\"" s "\""
		}
		$1 ~ /^[0-9.]+$/ && 1 < NF {
			n++; m[n] = $1 + 0
			name[n] = substr($0, length($1) + 2)
		}
		END {
			newest = 0
			for (i = 1; i <= n; i++) if (newest < m[i]) newest = m[i]
			out = ""
			for (k = 1; k <= 10; k++) {
				best = 0
				for (i = 1; i <= n; i++) if (!(i in taken) && (best == 0 || m[best] < m[i])) best = i
				if (best == 0) break
				taken[best] = 1
				out = out (out == "" ? "" : ",") "[" jstr(name[best]) "," sprintf("%.0f", m[best]) "]"
			}
			printf "%d\t%.0f\t[%s]\n", n, newest, out
		}')
	# shellcheck disable=SC2295
	count=${summary%%$TAB*}
	# shellcheck disable=SC2295
	rest=${summary#*$TAB}
	# shellcheck disable=SC2295
	newest=${rest%%$TAB*}
	# shellcheck disable=SC2295
	files=${rest#*$TAB}
	if ! is_num "$count" || ! is_num "$newest"; then
		emit_unknown sec.recent_change "$path" unsupported
		IFS=$NL
		continue
	fi
	fp=""
	if [ "$count" -gt 0 ]; then
		# The names alone, sorted, so editing a file again does not change it.
		list=$(printf '%s\n' "$found" | awk -F '\t' '$1 ~ /^[0-9.]+$/ && 1 < NF { print substr($0, length($1) + 2) }' | sort)
		fp=$(sha12_text "$list")
	fi
	emit sec.recent_change "$path" "$count" files "{\"newest\":$newest,\"files\":$files}" "$fp"
	IFS=$NL
done
