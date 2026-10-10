# sys.load: load average against the number of online CPUs.
# Value is the 5-minute average (steadier than 1 minute and not yet raised by
# the scan itself); data carries the 1- and 15-minute averages, and for the
# server's identity line the seconds since boot and the distribution's name
# (NAME and VERSION_ID of /etc/os-release, e.g. "Ubuntu 24.04").

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

extra=""
up=""
if [ -r /proc/uptime ] && read -r up _rest </proc/uptime; then
	up=${up%%.*}
fi
case $up in
'' | *[!0-9]*) ;;
*) extra="$extra,\"uptime\":$up" ;;
esac
os_name=""
os_ver=""
if [ -r /etc/os-release ]; then
	while IFS='=' read -r key val; do
		val=${val#\"}
		val=${val%\"}
		case $key in
		NAME) os_name=$val ;;
		VERSION_ID) os_ver=$val ;;
		esac
	done </etc/os-release
fi
[ -z "$os_name" ] || extra="$extra,\"os\":$(json_str "$os_name${os_ver:+ $os_ver}")"

emit sys.load "" "$l5" load "{\"cores\":$cores,\"load1\":$l1,\"load15\":$l15$extra}"
