# sys.psi: pressure stall information, the share of the last minute in which
# some tasks waited for CPU, memory or IO ("some avg60", Linux 4.20+).
# Kernels without PSI, or with it switched off (psi=0), are unsupported.

data=""
for res in cpu memory io; do
	[ -r "/proc/pressure/$res" ] || continue
	v=$(awk '$1 == "some" { for (i = 2; i <= NF; i++) if ($i ~ /^avg60=/) { sub(/^avg60=/, "", $i); print $i; exit } }' "/proc/pressure/$res")
	is_num "$v" || continue
	data="$data${data:+,}\"$res\":$v"
done

if [ -z "$data" ]; then
	emit_unknown sys.psi "" unsupported
	exit 0
fi
emit sys.psi "" "" "" "{$data}"
