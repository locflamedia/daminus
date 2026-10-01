#!/bin/sh
# Quick deny-list over the check scripts: grep for write, exec and privilege
# commands. The real gate is the allowlist in crates/core/tests/check_scripts.rs
# and the read-only container run (run.sh); this layer only fails fast.
# Comments are ignored. Usage: scripts/check-harness/deny-list.sh [FILE…]
set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)
if [ "$#" -eq 0 ]; then
	set -- "$root"/crates/core/checks/*.sh "$root"/crates/core/discover/*.sh
fi

words='rm|mv|cp|tee|dd|truncate|shred|chmod|chown|chgrp|ln|mkdir|rmdir|touch|install|sudo|su|doas|kill|pkill|killall|reboot|shutdown|halt|systemctl|service|crontab|mount|umount|apt|apt-get|yum|dnf|apk|pip|npm|curl|wget|nc|ncat|scp|rsync|ssh|eval|source|exec'
status=0
for file in "$@"; do
	# Drop comments; in the prelude, line 1 (`exec 2>/dev/null`) is the one
	# allowed exec. Then drop redirects to /dev/null or to a descriptor, and
	# the one other use of the word: `docker exec` of the SQL client in the
	# container (the allowlist test pins the rest of that command).
	# shellcheck disable=SC2016 # the `$` in the sed pattern is literal
	code=$(sed -e 's/^[[:space:]]*#.*//' -e 's/[[:space:]]#[^"'\'']*$//' "$file" |
		awk -v prelude="$(basename "$file")" 'prelude == "prelude.sh" && NR == 1 { print ""; next } { print }' |
		sed -E -e 's/[0-9]?>>?[[:space:]]*(\/dev\/null|&[0-9-])//g' \
			-e 's/docker exec (-i |-e [A-Z_]+ )*"\$container" (mysql|psql) /docker-sql-client /g')
	report() {
		hits=$(printf '%s\n' "$code" | grep -nE "$1" || true)
		if [ -n "$hits" ]; then
			printf '%s\n' "$hits" | sed "s|^|$file:|" >&2
			echo "  ^ $2" >&2
			status=1
		fi
	}
	report "(^|[^A-Za-z0-9_.-])($words)([^A-Za-z0-9_.-]|\$)" 'write, exec or privileged command'
	report 'sed[^|;]*[[:space:]](-i|--in-place)' 'sed -i'
	report 'find[^|;]*[[:space:]]-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)' 'find that deletes or runs commands'
	report '>' 'output redirected to a file'
	report '<<' 'here-document (some shells write it to a temp file)'
	report '(^|[;&|(])[[:space:]]*\.[[:space:]]' 'sourcing a file with .'
done
exit "$status"
