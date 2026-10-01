# sec.preload: whether /etc/ld.so.preload names any library. The dynamic
# linker loads every library listed there into every program, which is what
# rootkits use to hide processes and files; a clean server has no such file or
# an empty one. One fact for the file when it lists libraries (target = its
# path, data = how many, the first five and its size), otherwise one fact with
# an empty target and value 0. The libraries are only named, never opened.
# DAMINUS_PRELOAD_FILE lets tests point at another file; the app never sets it.

f=${DAMINUS_PRELOAD_FILE:-/etc/ld.so.preload}
if [ ! -e "$f" ]; then
	emit sec.preload "" 0 count
	exit 0
fi
if [ ! -r "$f" ]; then
	perm_missing sec.preload "$f"
	exit 0
fi

# Libraries are separated by white space or colons.
n=0
libs=""
set -f
while IFS= read -r line || [ -n "$line" ]; do
	IFS=": $TAB"
	for lib in $line; do
		n=$((n + 1))
		[ "$n" -gt 5 ] || libs="$libs${libs:+,}$(json_str "$lib")"
	done
	unset IFS
done <"$f"
if [ "$n" -eq 0 ]; then
	emit sec.preload "" 0 count
	exit 0
fi

size=0
mtime=0
meta=$(find "$f" -maxdepth 0 -printf '%s\t%T@\n')
if [ -n "$meta" ]; then
	# shellcheck disable=SC2295
	size=${meta%%$TAB*}
	# shellcheck disable=SC2295
	mtime=${meta#*$TAB}
fi
is_num "$size" || size=0
emit sec.preload "$f" "" "" "{\"entries\":$n,\"libs\":[$libs],\"size\":$size}" "$(file_fp "$size" "$mtime" "$f")"
