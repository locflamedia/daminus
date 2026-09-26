# sys.oom: processes the kernel killed for lack of memory in the last 24
# hours, from the kernel log. Every kill logs one "Killed process PID (name)"
# line, for the whole host and for a container's memory limit alike.
# Reading the kernel log needs root or the adm / systemd-journal group on
# most systems: without it the answer is Unknown(needs_perm), never 0.

# privileged: the SSH user may read the whole system journal.
privileged() {
	[ "$(id -u)" = 0 ] && return 0
	case " $(id -Gn) " in
	*" adm "* | *" systemd-journal "* | *" wheel "*) return 0 ;;
	esac
	return 1
}

if has journalctl; then
	log=$(run_light journalctl -k -q --no-pager -o cat --since -24h)
	rc=$?
	if [ "$rc" -eq 124 ]; then
		emit_unknown sys.oom "" timeout
		exit 0
	fi
	# An unprivileged user sees no kernel lines at all (only its own
	# journal), which must not read as "no kills".
	if [ -z "$log" ] && ! privileged; then
		perm_missing sys.oom ""
		exit 0
	fi
elif has dmesg; then
	# kernel.dmesg_restrict=1 makes this fail for normal users.
	if ! log=$(run_light dmesg); then
		perm_missing sys.oom ""
		exit 0
	fi
	# dmesg stamps lines with seconds since boot: keep the last 24 hours.
	up=0
	read -r up _rest </proc/uptime
	log=$(printf '%s\n' "$log" | awk -v up="$up" '
		{
			t = $0
			if (!sub(/^\[ */, "", t)) next
			sub(/\].*/, "", t)
			if (up - t < 86400) print
		}')
else
	emit_unknown sys.oom "" unsupported
	exit 0
fi

# Prints the kill count, then up to 10 distinct process names, one a line.
printf '%s\n' "$log" | awk '
	/Killed process [0-9]+ \(/ {
		n++
		name = $0
		sub(/.*Killed process [0-9]+ \(/, "", name)
		sub(/\).*/, "", name)
		if (!(name in seen) && k < 10) { seen[name] = 1; k++; names[k] = name }
	}
	END {
		printf "%d\n", n
		for (i = 1; i <= k; i++) print names[i]
	}' | {
	read -r count
	is_num "$count" || count=0
	procs=""
	while IFS= read -r name; do
		procs="$procs${procs:+,}$(json_str "$name")"
	done
	emit sys.oom "" "$count" count "{\"procs\":[$procs]}"
}
