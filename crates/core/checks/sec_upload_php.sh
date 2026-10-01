# sec.upload_php: PHP files inside upload folders. Visitors can put files
# there, and a PHP file that the web server runs is a web shell. Looks in every
# folder named `uploads` and in `storage/app/public` under each project folder
# on this host (DAMINUS_PATHS), skipping the Settings › Scan skip paths.
# Facts: one per file, the 50 newest per project folder (target = its path,
# data = size, mtime and how many were found in the folder, fp =
# size:mtime:sha12 of its first MiB); a folder with none gets one fact with
# the folder as target and value 0. Files are only listed and hashed.
#
# File names are whatever an uploader chose. find ends each record with a NUL
# and tr turns a newline inside a name into `?` before the list is read, so a
# name can neither break a line nor pass for another record.

[ -n "${DAMINUS_PATHS-}" ] || exit 0
if ! find_ok; then
	emit_unknown sec.upload_php "" unsupported
	exit 0
fi

IFS=$NL
set -f
# shellcheck disable=SC2046 # split on newlines only, with globbing off
set -- $(skip_expr)
unset IFS
IFS=$NL
for path in $DAMINUS_PATHS; do
	unset IFS
	[ -n "$path" ] || continue
	if [ ! -d "$path" ]; then
		emit_unknown sec.upload_php "$path" missing
		IFS=$NL
		continue
	fi
	if [ ! -r "$path" ] || [ ! -x "$path" ]; then
		perm_missing sec.upload_php "$path"
		IFS=$NL
		continue
	fi
	left=$(group_left "$SEC_GROUP_S")
	if [ "$left" -lt 2 ]; then
		emit_unknown sec.upload_php "$path" timeout
		IFS=$NL
		continue
	fi
	# The folder's own name goes into the patterns, so its glob characters
	# are escaped; `*` also matches `/`, so these reach any depth.
	glob=$(printf '%s\n' "$path" | sed 's/[][*?\\]/\\&/g')
	# size TAB mtime TAB path, one file a line.
	found=$(run_for "$left" find "$path" -xdev "$@" -type f \
		"(" -iname '*.php' -o -iname '*.php[0-9]' -o -iname '*.phtml' -o -iname '*.phar' -o -iname '*.pht' ")" \
		"(" -path "$glob/uploads/*" -o -path "$glob/*/uploads/*" -o -path "$glob/storage/app/public/*" -o -path "$glob/*/storage/app/public/*" ")" \
		-printf '%s\t%T@\t%p\0' | tr '\012\000' '?\012')
	# A find stopped at its time limit leaves nothing of the allowance.
	if [ "$(group_left "$SEC_GROUP_S")" -lt 1 ]; then
		emit_unknown sec.upload_php "$path" timeout
		IFS=$NL
		continue
	fi
	printf '%s\n' "$found" | top_recent 50 | {
		read -r total
		is_num "$total" || total=0
		if [ "$total" -eq 0 ]; then
			emit sec.upload_php "$path" 0 count
			exit 0
		fi
		while IFS=$TAB read -r size mtime file; do
			is_num "$size" || continue
			secs=${mtime%%.*}
			is_num "$secs" || secs=0
			emit sec.upload_php "$file" "" "" "{\"size\":$size,\"mtime\":$secs,\"total\":$total}" "$(file_fp "$size" "$mtime" "$file")"
		done
	}
	IFS=$NL
done
