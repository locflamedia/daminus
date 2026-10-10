# disk.path: size of each project folder on this host (DAMINUS_PATHS), its
# five largest subfolders and its largest files. Folders and files matching
# a skip path (Settings › Scan, DAMINUS_SKIP_PATHS: a bare name matches at
# any depth, a relative path matches as a suffix, an absolute one exactly)
# are neither sized nor listed, so du stays fast and the lists show the
# project's own data. Stays on the folder's filesystem (-x). Sizes are disk
# usage in bytes and each large file carries the time it last changed
# (find's %T@, whole seconds); nothing is opened or changed.

mb=${DAMINUS_LARGE_FILE_MB-50}
case $mb in '' | *[!0-9]*) mb=50 ;; esac

set -f
IFS=$NL
for path in ${DAMINUS_PATHS-}; do
	unset IFS
	[ -n "$path" ] || continue
	if [ ! -e "$path" ] || [ ! -d "$path" ]; then
		emit_unknown disk.path "$path" missing
		continue
	fi
	if [ ! -r "$path" ] || [ ! -x "$path" ]; then
		perm_missing disk.path "$path"
		continue
	fi

	# du: one --exclude per skip path.
	set --
	IFS=$NL
	for s in ${DAMINUS_SKIP_PATHS-}; do
		[ -n "$s" ] && set -- "$@" "--exclude=$s"
	done
	unset IFS
	# The folders share the disk group's allowance: once it is spent, the
	# rest are reported as timed out without walking them.
	left=$(group_left "$DISK_GROUP_S")
	if [ "$left" -lt 2 ]; then
		emit_unknown disk.path "$path" timeout
		continue
	fi
	sizes=$(run_for "$left" du -k -x -d 1 "$@" -- "$path")
	rc=$?
	if [ "$rc" -eq 124 ]; then
		emit_unknown disk.path "$path" timeout
		continue
	fi
	if [ -z "$sizes" ]; then
		# No GNU du (busybox has no --exclude).
		emit_unknown disk.path "$path" unsupported
		continue
	fi
	partial=false
	[ "$rc" -eq 0 ] || partial=true

	# Prints: total TAB other TAB top, top being a JSON list of [name, bytes].
	# The folder is the first input line: awk -v would decode its backslashes.
	line=$({ printf '%s\n' "$path"; printf '%s\n' "$sizes"; } | awk '
		# A JSON string: control characters are dropped, a backslash and a
		# quote are escaped (character by character: gsub escapes differ).
		function jstr(s,    o, i, c) {
			gsub(/[[:cntrl:]]/, "", s)
			o = ""
			for (i = 1; i <= length(s); i++) {
				c = substr(s, i, 1)
				if (c == "\\" || c == "\"") o = o "\\"
				o = o c
			}
			return "\"" o "\""
		}
		NR == 1 { root = $0; next }
		{
			tab = index($0, "\t")
			if (!tab) next
			kb = substr($0, 1, tab - 1)
			p = substr($0, tab + 1)
			if (kb !~ /^[0-9]+$/) next
			if (p == root) { total = kb + 0; next }
			prefix = (root == "/") ? "/" : root "/"
			if (substr(p, 1, length(prefix)) != prefix) next
			n++; name[n] = substr(p, length(prefix) + 1); size[n] = kb + 0
		}
		END {
			if (total == "") exit
			# Numbers, not strings: awk compares strings by text.
			top = ""; used = 0
			for (k = 1; k <= 5; k++) {
				best = 0
				for (i = 1; i <= n; i++) if (!(i in taken) && (best == 0 || size[best] < size[i])) best = i
				if (best == 0) break
				taken[best] = 1; used += size[best]
				top = top (top == "" ? "" : ",") "[" jstr(name[best]) "," sprintf("%.0f", size[best] * 1024) "]"
			}
			other = total - used
			if (other < 0) other = 0
			printf "%.0f\t%.0f\t[%s]\n", total * 1024, other * 1024, top
		}')
	# shellcheck disable=SC2295
	total=${line%%$TAB*}
	if ! is_num "$total"; then
		emit_unknown disk.path "$path" unsupported
		continue
	fi
	# shellcheck disable=SC2295
	rest=${line#*$TAB}
	# shellcheck disable=SC2295
	other=${rest%%$TAB*}
	# shellcheck disable=SC2295
	top=${rest#*$TAB}

	# find: skip paths pruned, then files over the floor, largest first.
	set --
	IFS=$NL
	for s in ${DAMINUS_SKIP_PATHS-}; do
		[ -n "$s" ] || continue
		[ "$#" -eq 0 ] || set -- "$@" -o
		case $s in
		/*) set -- "$@" -path "$s" ;;
		*/*) set -- "$@" -path "*/$s" ;;
		*) set -- "$@" -name "$s" ;;
		esac
	done
	unset IFS
	if [ "$#" -gt 0 ]; then
		set -- "(" "$@" ")" -prune -o
	fi
	files=""
	left=$(group_left "$DISK_GROUP_S")
	# Sized, but with no time left the large files are not listed.
	[ "$left" -ge 2 ] || partial=true
	[ "$left" -lt 2 ] || files=$(run_for "$left" find "$path" -xdev "$@" -type f -size "+${mb}M" -printf '%s\t%T@\t%P\n' | awk '
		# A JSON string: control characters are dropped, a backslash and a
		# quote are escaped (character by character: gsub escapes differ).
		function jstr(s,    o, i, c) {
			gsub(/[[:cntrl:]]/, "", s)
			o = ""
			for (i = 1; i <= length(s); i++) {
				c = substr(s, i, 1)
				if (c == "\\" || c == "\"") o = o "\\"
				o = o c
			}
			return "\"" o "\""
		}
		{
			tab = index($0, "\t")
			if (!tab) next
			b = substr($0, 1, tab - 1)
			if (b !~ /^[0-9]+$/) next
			rest = substr($0, tab + 1)
			tab = index(rest, "\t")
			if (!tab) next
			# find prints %T@ as seconds.fraction; the file list needs seconds.
			m = substr(rest, 1, tab - 1)
			if (m !~ /^[0-9]+(\.[0-9]+)?$/) next
			n++; size[n] = b + 0; mtime[n] = m + 0; name[n] = substr(rest, tab + 1)
		}
		END {
			out = ""
			for (k = 1; k <= 10; k++) {
				best = 0
				for (i = 1; i <= n; i++) if (!(i in taken) && (best == 0 || size[best] < size[i])) best = i
				if (best == 0) break
				taken[best] = 1
				out = out (out == "" ? "" : ",") "[" jstr(name[best]) "," sprintf("%.0f", size[best]) "," sprintf("%.0f", mtime[best]) "]"
			}
			printf "[%s]", out
		}')
	case $files in \[*\]) ;; *) files="[]" ;; esac

	emit disk.path "$path" "$total" bytes "{\"top\":$top,\"other\":$other,\"files\":$files,\"partial\":$partial}"
done
