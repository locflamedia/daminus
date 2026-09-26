# sys.mem: memory still available to programs, as a share of the total.
# MemAvailable (Linux 3.14+) counts reclaimable cache; older kernels get
# MemFree + Buffers + Cached as the nearest equivalent.

if [ ! -r /proc/meminfo ]; then
	emit_unknown sys.mem "" unsupported
	exit 0
fi

# Prints: total_kB available_kB, or nothing without MemTotal.
line=$(awk '
	$1 == "MemTotal:" { total = $2 }
	$1 == "MemAvailable:" { avail = $2; has_avail = 1 }
	$1 == "MemFree:" { free = $2 }
	$1 == "Buffers:" { buffers = $2 }
	$1 == "Cached:" { cached = $2 }
	END {
		if (total == "" || total + 0 == 0) exit
		if (!has_avail) avail = free + buffers + cached
		printf "%.0f %.0f\n", total, avail
	}
' </proc/meminfo)

total=${line% *}
avail=${line#* }
case $total$avail in
'' | *[!0-9]*)
	emit_unknown sys.mem "" unsupported
	exit 0
	;;
esac

pct=$(awk -v a="$avail" -v t="$total" 'BEGIN { printf "%.1f", a * 100 / t }')
emit sys.mem "" "$pct" % "{\"total\":$((total * 1024)),\"available\":$((avail * 1024))}"
