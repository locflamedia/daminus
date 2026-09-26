# sys.load: load average against the number of online CPUs.
# Value is the 5-minute average (steadier than 1 minute and not yet raised by
# the scan itself); data carries the 1- and 15-minute averages.

if ! read -r l1 l5 l15 _rest </proc/loadavg; then
	emit_unknown sys.load "" unsupported
	exit 0
fi

cores=""
if has nproc; then
	cores=$(nproc)
fi
case $cores in
'' | *[!0-9]*)
	if has getconf; then
		cores=$(getconf _NPROCESSORS_ONLN)
	fi
	;;
esac
case $cores in
'' | 0 | *[!0-9]*)
	emit_unknown sys.load "" unsupported
	exit 0
	;;
esac

if ! is_num "$l1" || ! is_num "$l5" || ! is_num "$l15"; then
	emit_unknown sys.load "" unsupported
	exit 0
fi

emit sys.load "" "$l5" load "{\"cores\":$cores,\"load1\":$l1,\"load15\":$l15}"
