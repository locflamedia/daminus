# logs.big: log files over 500 MiB in /var/log, Docker's container logs
# (/var/lib/docker/containers) and each project folder's storage/logs. One
# fact per file (target = its path, value = bytes); when none is found, one
# fact with an empty target and value 0. Sizes come from stat (find), so no
# log is ever opened. A folder the SSH user cannot enter is reported as
# Unknown(needs_perm) with the folder as target.

dirs="/var/log${NL}/var/lib/docker/containers"
# Lists are split on newlines only, never globbed; IFS goes back to the
# default inside each loop (run_light splits its wrapper on spaces).
set -f
IFS=$NL
for p in ${DAMINUS_PATHS-}; do
	dirs="$dirs$NL${p%/}/storage/logs"
done

found=0
IFS=$NL
for dir in $dirs; do
	unset IFS
	[ -d "$dir" ] || continue
	if [ ! -r "$dir" ] || [ ! -x "$dir" ]; then
		perm_missing logs.big "$dir"
		continue
	fi
	# The disk group's allowance is shared with disk.path: once it is spent,
	# the remaining folders are reported as timed out without a walk.
	left=$(group_left "$DISK_GROUP_S")
	if [ "$left" -lt 2 ]; then
		emit_unknown logs.big "$dir" timeout
		continue
	fi
	# size TAB mtime TAB path, one file a line.
	files=$(run_for "$left" find "$dir" -xdev -type f -size +500M -printf '%s\t%T@\t%p\n')
	if [ "$?" -eq 124 ]; then
		emit_unknown logs.big "$dir" timeout
		continue
	fi
	IFS=$NL
	for rec in $files; do
		unset IFS
		# A tab holds no pattern characters, so it matches itself unquoted.
		# shellcheck disable=SC2295
		size=${rec%%$TAB*}
		# shellcheck disable=SC2295
		rest=${rec#*$TAB}
		# shellcheck disable=SC2295
		mtime=${rest%%$TAB*}
		mtime=${mtime%.*}
		# shellcheck disable=SC2295
		path=${rest#*$TAB}
		is_num "$size" || continue
		is_num "$mtime" || mtime=0
		found=1
		emit logs.big "$path" "$size" bytes "{\"mtime\":$mtime}"
	done
done
[ "$found" -eq 1 ] || emit logs.big "" 0 bytes
