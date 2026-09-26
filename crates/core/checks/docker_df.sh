# docker.df: space Docker uses for images, containers, local volumes and
# build cache, and how much of each is reclaimable (`docker system df`).
# Hosts without Docker report nothing; a user outside the docker group gets
# Unknown(needs_perm). Sizes are docker's rounded decimal units, in bytes.

docker_ok
case $? in
0) ;;
2)
	perm_missing docker.df ""
	exit 0
	;;
*)
	# Installed without a running daemon: say so; not installed: no row.
	has docker && emit_unknown docker.df "" missing
	exit 0
	;;
esac

out=$(run_light docker system df --format "{{.Type}}$TAB{{.TotalCount}}$TAB{{.Active}}$TAB{{.Size}}$TAB{{.Reclaimable}}")
if [ "$?" -eq 124 ]; then
	emit_unknown docker.df "" timeout
	exit 0
fi

# Prints: total_bytes TAB data-object, or nothing when no line parsed.
line=$(printf '%s\n' "$out" | awk -F '\t' '
	# "1.2GB (38%)" in bytes. Units are decimal (docker HumanSize) except
	# the binary ones stats uses, accepted for safety.
	function bytes(s,   num, unit, m) {
		sub(/ .*/, "", s)
		num = s; sub(/[A-Za-z]+$/, "", num)
		unit = substr(s, length(num) + 1)
		if (num !~ /^[0-9]+(\.[0-9]+)?$/) return -1
		m = 1
		if (unit == "kB" || unit == "KB") m = 1e3
		else if (unit == "MB") m = 1e6
		else if (unit == "GB") m = 1e9
		else if (unit == "TB") m = 1e12
		else if (unit == "PB") m = 1e15
		else if (unit == "KiB") m = 1024
		else if (unit == "MiB") m = 1048576
		else if (unit == "GiB") m = 1073741824
		else if (unit == "TiB") m = 1099511627776
		else if (unit != "B") return -1
		return num * m
	}
	NF == 5 {
		if ($1 == "Images") k = "images"
		else if ($1 == "Containers") k = "containers"
		else if ($1 == "Local Volumes") k = "volumes"
		else if ($1 == "Build Cache") k = "build_cache"
		else next
		size = bytes($4); rec = bytes($5)
		if (size < 0 || rec < 0 || $2 !~ /^[0-9]+$/ || $3 !~ /^[0-9]+$/) next
		total += size
		obj = obj (obj == "" ? "" : ",") sprintf("\"%s\":{\"count\":%d,\"active\":%d,\"size\":%.0f,\"reclaimable\":%.0f}", k, $2, $3, size, rec)
	}
	END { if (obj != "") printf "%.0f\t{%s}\n", total, obj }')

if [ -z "$line" ]; then
	emit_unknown docker.df "" unsupported
	exit 0
fi
# shellcheck disable=SC2295
emit docker.df "" "${line%%$TAB*}" bytes "${line#*$TAB}"
