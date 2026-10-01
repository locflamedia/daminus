# sec.miner: crypto miners and fileless malware among the running processes.
# A process is reported when its name is a known miner or dropper, or when it
# runs from a deleted file kept in a place programs are not installed to
# (/tmp, /var/tmp, /dev/shm, /run, /dev, memfd:). A deleted binary elsewhere
# is what an upgrade leaves behind, so it is not reported. Only the process
# name (comm) and the path of its executable are read; the command line and
# the environment, which can hold passwords, are never opened.
#
# Coverage: the executable of another user's process can only be read as
# root, so a non-root SSH user sees few of them. `seen` is how many of the
# `total` processes (kernel threads and zombies left out) had a readable
# executable. A run that finds nothing but did not see them all is
# Unknown(needs_perm), never ok, and says how far it got: data {seen, total}.
#
# Facts: one per distinct process name found (target = the name, data = seen,
# total, count, the executable path, whether it is deleted and why it was
# reported, fp = name|executable path); when nothing is found and every
# process was seen, one fact with an empty target and value 0.
# DAMINUS_PROC lets tests point at another /proc; the app never sets it.

proc=${DAMINUS_PROC:-/proc}
if [ ! -d "$proc/self" ] || ! find_ok; then
	emit_unknown sec.miner "" unsupported
	exit 0
fi
left=$(group_left "$SEC_GROUP_S")
if [ "$left" -lt 2 ]; then
	emit_unknown sec.miner "" timeout
	exit 0
fi

# list_procs SECS: `P TAB pid TAB comm` for every live user process, then
# `E TAB /proc/pid TAB executable` for every link find can read in SECS, then
# `L TAB pid` for every process still there. A process that ended while find
# ran has no link and no `L` row, and is dropped from the total instead of
# counting as one that could not be inspected. The names come from
# /proc/PID/comm and the flags from /proc/PID/stat: field 9, bit 0x200000, is
# a kernel thread. A newline inside an executable's path (a name the attacker
# chose) becomes `?`, so it cannot pass for another record. The state is the
# first field after the closing parenthesis of the name. (A function, not
# inline in the substitution below: bash 3.2, `sh` on a Mac, cannot parse a
# `case` or a `)` inside `$(…)`.)
# shellcheck disable=SC2086,SC2295 # the stat fields are split on purpose.
list_procs() {
	paren=') '
	for dir in "$proc"/[0-9]*; do
		read -r stat <"$dir/stat" || continue
		read -r comm <"$dir/comm" || continue
		set -- ${stat##*$paren}
		[ "$#" -ge 7 ] || continue
		case $7 in '' | *[!0-9]*) continue ;; esac
		[ "$1" != Z ] || continue
		[ "$(($7 & 2097152))" -eq 0 ] || continue
		pid=${dir##*/}
		printf 'P\t%s\t%s\n' "$pid" "$comm"
	done
	run_for "$1" find "$proc" -maxdepth 2 -path "$proc/[0-9]*/exe" -printf 'E\t%h\t%l\0' | tr '\012\000' '?\012'
	for dir in "$proc"/[0-9]*; do
		[ -e "$dir/stat" ] || continue
		printf 'L\t%s\n' "${dir##*/}"
	done
}

procs=$(list_procs "$left" | awk -F '\t' '
	BEGIN {
		n = split("xmrig xmr-stak xmrigDaemon minerd cpuminer cpuminer-multi cgminer bfgminer ethminer kinsing kdevtmpfsi kthreaddi", names, " ")
		for (i = 1; i <= n; i++) known[tolower(names[i])] = 1
	}
	function jstr(s) {
		gsub(/[\\"]/, "?", s); gsub(/[[:cntrl:]]/, "", s)
		return "\"" s "\""
	}
	$1 == "P" {
		total++
		order[total] = $2
		comm = $3
		for (i = 4; i <= NF; i++) comm = comm " " $i
		name[$2] = comm
		next
	}
	$1 == "L" { live[$2] = 1; next }
	$1 == "E" {
		pid = $2
		sub(/.*\//, "", pid)
		if (!(pid in name)) next
		exe = $3
		for (i = 4; i <= NF; i++) exe = exe " " $i
		if (exe != "") { seen++; path[pid] = exe }
		next
	}
	END {
		gone = 0
		for (k = 1; k <= total; k++) if (!(order[k] in path) && !(order[k] in live)) gone++
		printf "S\t%d\t%d\n", seen, total - gone
		for (k = 1; k <= total; k++) {
			pid = order[k]
			why = ""
			if (tolower(name[pid]) in known) why = "name"
			exe = path[pid]
			deleted = 0
			base = exe
			if (exe ~ / \(deleted\)$/) {
				deleted = 1
				sub(/ \(deleted\)$/, "", base)
			}
			# A miner renamed in comm still runs from a file with its name.
			prog = base
			sub(/.*\//, "", prog)
			if (why == "" && prog != "" && (tolower(prog) in known)) why = "name"
			if (deleted) {
				if (why == "" && (base ~ /^\/(tmp|var\/tmp|dev|run|var\/run)\// || base ~ /^\/memfd:/)) why = "deleted"
			}
			if (why == "") continue
			# One finding per distinct binary: two processes with one name
			# can run different files.
			key = name[pid] "\t" exe
			if (key in count) { count[key]++; continue }
			nkeys++; keys[nkeys] = key
			count[key] = 1; reason[key] = why; kname[key] = name[pid]; kexe[key] = exe; kdel[key] = deleted
		}
		for (i = 1; i <= nkeys; i++) {
			key = keys[i]
			printf "F\t%s\t%s\t%d\t%s\t%d\n", kname[key], kexe[key], kdel[key], reason[key], count[key]
		}
	}')

# The first line is the coverage, the rest are findings.
found=0
seen=0
total=0
set -f
IFS=$NL
for row in $procs; do
	unset IFS
	# shellcheck disable=SC2295
	case $row in
	S"$TAB"*)
		rest=${row#S$TAB}
		seen=${rest%%$TAB*}
		total=${rest#*$TAB}
		is_num "$seen" || seen=0
		is_num "$total" || total=0
		;;
	F"$TAB"*)
		rest=${row#F$TAB}
		name=${rest%%$TAB*}
		rest=${rest#*$TAB}
		exe=${rest%%$TAB*}
		rest=${rest#*$TAB}
		deleted=${rest%%$TAB*}
		rest=${rest#*$TAB}
		why=${rest%%$TAB*}
		count=${rest#*$TAB}
		is_num "$count" || count=1
		case $deleted in 1) deleted=true ;; *) deleted=false ;; esac
		found=1
		emit sec.miner "$name" "" "" "{\"seen\":$seen,\"total\":$total,\"count\":$count,\"exe\":$(json_str "$exe"),\"deleted\":$deleted,\"why\":$(json_str "$why")}" "$name|$exe"
		;;
	esac
	IFS=$NL
done
unset IFS
[ "$found" -eq 0 ] || exit 0

if [ "$seen" -lt "$total" ] || [ "$total" -eq 0 ]; then
	emit_unknown sec.miner "" needs_perm "{\"seen\":$seen,\"total\":$total}"
else
	emit sec.miner "" 0 count "{\"seen\":$seen,\"total\":$total}"
fi
