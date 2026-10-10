# docker.compose: the containers of each compose project on this host
# (DAMINUS_COMPOSE), by the label com.docker.compose.project. `docker
# inspect` always runs with a --format naming the fields it reads (name,
# service label, state, restarts, memory limit, OOM flag, exit code, start
# time, exit time, published ports, restart policy, image), so the container
# environment (Config.Env) is never printed. One-off containers (`compose
# run`) are left out, and a container that exited 0 with restart policy "no"
# counts as done, not down.

[ -n "${DAMINUS_COMPOSE-}" ] || exit 0

docker_ok
state=$?

# shellcheck disable=SC2016 # $p and $b are Go template variables, not shell
fmt='{{.Id}}'"$TAB"'{{.Name}}'"$TAB"'{{index .Config.Labels "com.docker.compose.service"}}'"$TAB"'{{index .Config.Labels "com.docker.compose.oneoff"}}'"$TAB"'{{.State.Status}}'"$TAB"'{{.RestartCount}}'"$TAB"'{{.HostConfig.Memory}}'"$TAB"'{{.State.OOMKilled}}'"$TAB"'{{.State.ExitCode}}'"$TAB"'{{.State.StartedAt}}'"$TAB"'{{.State.FinishedAt}}'"$TAB"'{{range $p, $b := .NetworkSettings.Ports}}{{range $b}}{{.HostIp}}:{{.HostPort}}={{$p}} {{end}}{{end}}'"$TAB"'{{.HostConfig.RestartPolicy.Name}}'"$TAB"'{{.Config.Image}}'

set -f
IFS=$NL
for project in $DAMINUS_COMPOSE; do
	unset IFS
	[ -n "$project" ] || continue
	case $state in
	0) ;;
	2)
		perm_missing docker.compose "$project"
		continue
		;;
	*)
		emit_unknown docker.compose "$project" missing
		continue
		;;
	esac

	ids=$(run_light docker ps -aq --no-trunc --filter "label=com.docker.compose.project=$project")
	if [ "$?" -eq 124 ]; then
		emit_unknown docker.compose "$project" timeout
		continue
	fi
	case $ids in
	'')
		# No container at all: the project was removed or never started
		# here. A result, not an unknown: the manifest rates it critical.
		emit docker.compose "$project" "" "" '{"containers":0,"running":0,"not_running":0,"restarts":0,"mem_pct":0,"services":[]}'
		continue
		;;
	*[!0-9a-f"$NL"]*)
		# Output that is not container ids: docker answered something else.
		emit_unknown docker.compose "$project" missing
		continue
		;;
	esac

	# shellcheck disable=SC2086 # ids are hex words, split on purpose
	inspected=$(run_light docker inspect --format "$fmt" $ids)
	running=$(printf '%s\n' "$inspected" | awk -F '\t' '$5 == "running" { print $1 }')
	stats=""
	if [ -n "$running" ]; then
		# shellcheck disable=SC2086 # ids are hex words, split on purpose
		stats=$(run_light docker stats --no-stream --no-trunc --format "{{.ID}}$TAB{{.CPUPerc}}$TAB{{.MemUsage}}$TAB{{.MemPerc}}" $running)
	fi

	data=$({
		printf '%s\n' "$inspected" | awk '{ print "I\t" $0 }'
		printf '%s\n' "$stats" | awk '{ print "S\t" $0 }'
	} | awk -F '\t' '
		function jstr(s) {
			gsub(/[\\"]/, "?", s); gsub(/[[:cntrl:]]/, "", s)
			return "\"" s "\""
		}
		function num(s) { return (s ~ /^-?[0-9]+(\.[0-9]+)?$/) ? s : 0 }
		# Docker writes the zero time for a container that has never exited.
		function stamp(s) { return (s ~ /^0001-01-01/) ? "" : s }
		# The published host ports of one container, each once and in order, from
		# the "HOSTIP:HOSTPORT=CONTAINERPORT/proto " pairs the format prints. A
		# binding with no host port is not published, and 0.0.0.0 and [::] are
		# the same port twice.
		function host_ports(s,   i, m, k, hp, part, seen, out) {
			m = split(s, part, " ")
			out = ""
			for (i = 1; i <= m; i++) {
				if (part[i] !~ /=/) continue
				hp = part[i]; sub(/=.*/, "", hp)
				k = hp; sub(/.*:/, "", k)
				if (k !~ /^[0-9]+$/) continue
				if (k in seen) continue
				seen[k] = 1
				out = out (out == "" ? "" : " ") k
			}
			return out
		}
		function first_port(s,   p) {
			p = host_ports(s)
			sub(/ .*/, "", p)
			return p
		}
		function more_ports(s,   p, drop) {
			p = host_ports(s)
			return (p == "") ? 0 : split(p, drop, " ") - 1
		}
		function bytes(s,   n, u, m) {
			sub(/^ +/, "", s); sub(/ .*/, "", s)
			n = s; sub(/[A-Za-z]+$/, "", n)
			u = substr(s, length(n) + 1)
			if (n !~ /^[0-9]+(\.[0-9]+)?$/) return 0
			m = 1
			if (u == "KiB") m = 1024
			else if (u == "MiB") m = 1048576
			else if (u == "GiB") m = 1073741824
			else if (u == "TiB") m = 1099511627776
			else if (u == "kB" || u == "KB") m = 1e3
			else if (u == "MB") m = 1e6
			else if (u == "GB") m = 1e9
			else if (u == "TB") m = 1e12
			return n * m
		}
		$1 == "S" && NF == 5 {
			cpu[$2] = $3; sub(/%$/, "", cpu[$2])
			used[$2] = bytes($4)
			pct[$2] = $5; sub(/%$/, "", pct[$2])
			next
		}
		$1 == "I" && NF == 15 {
			if ($5 == "True" || $5 == "true") next
			n++
			id[n] = $2; name[n] = $3; sub(/^\//, "", name[n])
			svc[n] = $4; st[n] = $6; rs[n] = num($7); lim[n] = num($8)
			oom[n] = ($9 == "true") ? "true" : "false"; code[n] = num($10)
			started[n] = $11; finished[n] = stamp($12)
			port[n] = first_port($13); extra[n] = more_ports($13)
			policy[n] = $14; image[n] = $15
		}
		END {
			if (n == 0) exit
			run = 0; down = 0; rsum = 0; mem = 0; list = ""
			for (i = 1; i <= n; i++) {
				if (st[i] == "running") run++
				else if (!(st[i] == "exited" && code[i] == 0 && (policy[i] == "no" || policy[i] == ""))) down++
				rsum += rs[i]
				p = num(pct[id[i]]) + 0
				if (mem < p) mem = p
				list = list (list == "" ? "" : ",") sprintf("{\"name\":%s,\"svc\":%s,\"state\":%s,\"restarts\":%d,\"mem\":%.0f,\"limit\":%.0f,\"cpu\":%s,\"oom\":%s,\"exit\":%d,\"started\":%s,\"exited\":%s,\"port\":%s,\"ports_more\":%d,\"image\":%s}", jstr(name[i]), jstr(svc[i]), jstr(st[i]), rs[i], used[id[i]] + 0, lim[i], num(cpu[id[i]]), oom[i], code[i], jstr(started[i]), jstr(finished[i]), jstr(port[i]), extra[i], jstr(image[i]))
			}
			printf "{\"containers\":%d,\"running\":%d,\"not_running\":%d,\"restarts\":%d,\"mem_pct\":%s,\"services\":[%s]}\n", n, run, down, rsum, mem, list
		}')

	if [ -z "$data" ]; then
		# Only one-off containers, or inspect gave nothing readable.
		emit_unknown docker.compose "$project" missing
		continue
	fi
	emit docker.compose "$project" "" "" "$data"
done
