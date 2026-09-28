# sys.swap: share of swap space in use. A host without swap reports 0 with
# total 0, so the row reads "no swap" rather than missing.

if [ ! -r /proc/meminfo ]; then
	emit_unknown sys.swap "" unsupported
	exit 0
fi

# Prints: total_kB free_kB, or nothing without SwapTotal.
line=$(awk '
	$1 == "SwapTotal:" { total = $2; seen = 1 }
	$1 == "SwapFree:" { free = $2 }
	END { if (seen) printf "%.0f %.0f\n", total, free }
' </proc/meminfo)

total=${line% *}
free=${line#* }
case $total$free in
'' | *[!0-9]*)
	emit_unknown sys.swap "" unsupported
	exit 0
	;;
esac

used=$((total - free))
[ "$used" -ge 0 ] || used=0
pct=$(awk -v u="$used" -v t="$total" 'BEGIN { if (t == 0) print 0; else printf "%.1f", u * 100 / t }')
emit sys.swap "" "$pct" % "{\"total\":$((total * 1024)),\"used\":$((used * 1024))}"
