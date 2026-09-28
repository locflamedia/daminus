# disk.fs: space and inode use of every local, device-backed filesystem.
# Pseudo, memory and image filesystems (tmpfs, overlay, squashfs…) are
# skipped, network ones too (df -l, so a dead NFS mount cannot hang the scan),
# and a device mounted more than once (bind mounts) is reported once, at its
# shortest mount point, which is the real mount root (`/` rather than a bind
# mount such as /etc/resolv.conf). Mount points that are not directories
# (single-file bind mounts) are never reported.

blocks=$(run_light df -P -T -k -l)
case $? in
0) ;;
124)
	emit_unknown disk.fs "" timeout
	exit 0
	;;
*)
	# GNU df exits 1 when one mount is unreadable but still prints the rest.
	if [ -z "$blocks" ]; then
		emit_unknown disk.fs "" unsupported
		exit 0
	fi
	;;
esac
inodes=$(run_light df -P -T -i -l)

# Both tables in one stream: block lines, a marker, inode lines. Columns:
# source type size used avail capacity mount (mount may contain spaces).
# Prints: mount TAB pct TAB ipct TAB size TAB used TAB avail TAB type.
{
	printf '%s\n' "$blocks"
	printf '%s\n' '@@inodes'
	printf '%s\n' "$inodes"
} | awk '
	function mountpoint(   m, i) {
		m = $7
		for (i = 8; i <= NF; i++) m = m " " $i
		return m
	}
	function real(src, type) {
		if (type ~ /^(tmpfs|devtmpfs|ramfs|overlay|aufs|squashfs|iso9660|proc|sysfs|cgroup2?|devpts|mqueue|efivarfs|nsfs|tracefs|debugfs|securityfs|pstore|bpf|hugetlbfs|configfs|fusectl|binfmt_misc|autofs|fuse\..*)$/) return 0
		return src ~ /^\/dev\// || type == "zfs"
	}
	$0 == "@@inodes" { part = 2; next }
	$1 == "Filesystem" { next }
	NF < 7 { next }
	part == 2 {
		m = mountpoint()
		ip = $6
		sub(/%$/, "", ip)
		if (ip !~ /^[0-9]+$/) ip = 0
		ipct[m] = ip
		next
	}
	{
		if (!real($1, $2)) next
		m = mountpoint()
		if (m ~ /^\/(proc|sys|dev)(\/|$)/) next
		p = $6
		sub(/%$/, "", p)
		if (p !~ /^[0-9]+$/) next
		if ($1 in dev) {
			i = dev[$1]
			if (length(mnt[i]) <= length(m)) next
		} else {
			n++
			i = n
			dev[$1] = i
		}
		mnt[i] = m; pct[i] = p; fstype[i] = $2
		size[i] = $3; used[i] = $4; avail[i] = $5
	}
	END {
		for (i = 1; i <= n; i++) {
			ip = (mnt[i] in ipct) ? ipct[mnt[i]] : 0
			printf "%s\t%s\t%s\t%.0f\t%.0f\t%.0f\t%s\n", mnt[i], pct[i], ip, size[i] * 1024, used[i] * 1024, avail[i] * 1024, fstype[i]
		}
	}
' | {
	found=0
	while IFS='	' read -r mnt pct ipct size used avail fs; do
		[ -d "$mnt" ] || continue
		found=1
		emit disk.fs "$mnt" "" "" "{\"pct\":$pct,\"ipct\":$ipct,\"size\":$size,\"used\":$used,\"avail\":$avail,\"fs\":$(json_str "$fs")}"
	done
	# No device-backed filesystem at all (a container on overlay only).
	[ "$found" -eq 1 ] || emit_unknown disk.fs "" unsupported
}
