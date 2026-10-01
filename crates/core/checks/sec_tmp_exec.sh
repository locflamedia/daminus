# sec.tmp_exec: executable files in /tmp, /var/tmp and /dev/shm, where
# droppers and miners usually leave their binaries. One fact per file, the 50
# newest (target = its path, data = size, mtime and how many files were found
# in all, fp = size:mtime:sha12 of its first MiB); when there is none, one
# fact with an empty target and value 0. Folders are searched to depth 4 and
# only on their own filesystem. Nothing is opened but to hash it. File names
# are whatever a program chose: find ends each record with a NUL and tr turns
# a newline inside a name into `?`, so a name cannot pass for another record.
# DAMINUS_TMP_DIRS (one folder per line) lets tests search elsewhere; the app
# never sets it.

if ! find_ok; then
	emit_unknown sec.tmp_exec "" unsupported
	exit 0
fi
dirs=${DAMINUS_TMP_DIRS-}
[ -n "$dirs" ] || dirs="/tmp${NL}/var/tmp${NL}/dev/shm"
all=""
seen_dir=0
set -f
IFS=$NL
for dir in $dirs; do
	unset IFS
	if [ -d "$dir" ]; then
		if [ ! -r "$dir" ] || [ ! -x "$dir" ]; then
			perm_missing sec.tmp_exec "$dir"
			IFS=$NL
			continue
		fi
		left=$(group_left "$SEC_GROUP_S")
		if [ "$left" -lt 2 ]; then
			emit_unknown sec.tmp_exec "$dir" timeout
			IFS=$NL
			continue
		fi
		seen_dir=1
		# size TAB mtime TAB path
		found=$(run_for "$left" find "$dir" -xdev -maxdepth 4 -type f -perm /111 -printf '%s\t%T@\t%p\0' | tr '\012\000' '?\012')
		# A find stopped at its time limit leaves nothing of the allowance.
		if [ "$(group_left "$SEC_GROUP_S")" -lt 1 ]; then
			emit_unknown sec.tmp_exec "$dir" timeout
		else
			all="$all${all:+$NL}$found"
		fi
	fi
	IFS=$NL
done
unset IFS

[ "$seen_dir" -eq 1 ] || exit 0
printf '%s\n' "$all" | top_recent 50 | {
	read -r total
	is_num "$total" || total=0
	if [ "$total" -eq 0 ]; then
		emit sec.tmp_exec "" 0 count
		exit 0
	fi
	while IFS=$TAB read -r size mtime path; do
		is_num "$size" || continue
		secs=${mtime%%.*}
		is_num "$secs" || secs=0
		emit sec.tmp_exec "$path" "" "" "{\"size\":$size,\"mtime\":$secs,\"total\":$total}" "$(file_fp "$size" "$mtime" "$path")"
	done
}
