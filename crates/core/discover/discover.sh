# discover: what a host runs and where it lives, so setup can suggest
# projects. One JSON record per line, the kind in "rec":
#   vhost     an nginx server block: file, names, root, proxy target, ssl, php, ports
#   compose   a docker compose project: name, folder, services, containers, published ports
#   pm2       a pm2 app: name, daemon home, instances, status, folder
#   pm2_home  a pm2 daemon this user may not ask (another user's)
#   db        a database server: a process or a container, and its engine
#   env       a .env file: its path and whether it can be read. NEVER its content.
#   port      a listening TCP port: number, bind (any / loopback / other), who holds it
#   note      a source that could not be read (docker without permission, nginx config, ...)
# Read-only, like a check: it never opens a .env (a file is only tested with
# -r), never starts a daemon (pm2_state first), never prints an environment,
# a command line or file content: only names, paths and numbers. DAMINUS_PROC
# and DAMINUS_NGINX_CONF let tests point it at a fake /proc and nginx config;
# the app never sets them.

nvm_path
# No globbing unless a section asks for it (names and paths from the server
# are never patterns).
set -f

# Folders the .env search also looks in: where the sections below found code.
dirs=""
# The search stops this long after the script started.
BUDGET_S=45

# take OUTPUT: prints the JSON record lines of a section's output and
# remembers its `#dir /path` lines for the .env search.
take() {
	printf '%s\n' "$1" | awk '/^\{/'
	dirs="$dirs$NL$(printf '%s\n' "$1" | awk '/^#dir \//{ print substr($0, 6) }')"
}

# glob_files PATTERN: the regular files a glob matches, one per line.
glob_files() {
	set +f
	for _g in $1; do
		[ -f "$_g" ] && printf '%s\n' "$_g"
	done
	set -f
	return 0
}

# --------------------------------------------------------------------- nginx

# nginx_files: nginx.conf and what it includes (up to 4 levels, 60 files), one per line.
# The main nginx config: the test override, else the first readable of the
# usual places (distro, source build, aaPanel), else the first that exists.
nginx_conf() {
	if [ -n "${DAMINUS_NGINX_CONF:-}" ]; then
		printf '%s' "$DAMINUS_NGINX_CONF"
		return 0
	fi
	for _p in /etc/nginx/nginx.conf /usr/local/nginx/conf/nginx.conf /www/server/nginx/conf/nginx.conf; do
		[ -r "$_p" ] && {
			printf '%s' "$_p"
			return 0
		}
	done
	for _p in /etc/nginx/nginx.conf /usr/local/nginx/conf/nginx.conf /www/server/nginx/conf/nginx.conf; do
		[ -e "$_p" ] && {
			printf '%s' "$_p"
			return 0
		}
	done
	printf '%s' /etc/nginx/nginx.conf
}

nginx_files() {
	_conf=$(nginx_conf)
	[ -r "$_conf" ] || return 0
	_base=${_conf%/*}
	_seen=$NL
	_todo=$_conf
	_level=0
	_count=0
	set -f
	while [ -n "$_todo" ] && [ "$_level" -lt 4 ]; do
		_next=""
		IFS=$NL
		for _f in $_todo; do
			unset IFS
			case $_seen in *"$NL$_f$NL"*) continue ;; esac
			[ -r "$_f" ] || continue
			[ "$_count" -lt 60 ] || break
			_count=$((_count + 1))
			_seen="$_seen$_f$NL"
			# An `include` starts a statement: it follows a `;`, a brace or the line start.
			_incs=$(awk '{
				sub(/#.*/, ""); gsub(/[{};]/, " & ")
				for (i = 1; i < NF; i++) if ($i == "include" && (i == 1 || $(i - 1) == ";" || $(i - 1) == "{" || $(i - 1) == "}")) print $(i + 1)
			}' "$_f")
			IFS=$NL
			for _i in $_incs; do
				unset IFS
				case $_i in /*) ;; *) _i=$_base/$_i ;; esac
				_next="$_next$(glob_files "$_i")$NL"
				IFS=$NL
			done
			unset IFS
		done
		unset IFS
		_todo=$_next
		_level=$((_level + 1))
	done
	printf '%s' "$_seen"
}

disc_nginx() {
	# A config that exists but cannot be read: the list will be incomplete.
	_c=$(nginx_conf)
	if [ -e "$_c" ] && [ ! -r "$_c" ]; then
		printf '{"rec":"note","code":"nginx_no_permission"}\n'
		return 0
	fi
	_files=$(nginx_files)
	[ -n "$_files" ] || return 0
	IFS=$NL
	set -f
	# A small tokenizer: statements end at `;`, blocks open and close at the
	# braces. A `server` block yields one record; an `upstream` block is
	# remembered so a proxy_pass to its name resolves to its first server.
	# shellcheck disable=SC2086 # the file names are split on newlines only
	_out=$(awk '
		function ok(s) { return s !~ /["\\]/ && s !~ /[[:cntrl:]]/ }
		function unq(s) { gsub(/^["\047]|["\047]$/, "", s); return s }
		function begin_server() {
			in_server = 1; sdepth = depth + 1
			names = ""; root = ""; root_loc = ""; proxy = ""; php = 0; ssl = 0; listen = ""
		}
		function open_block() {
			if (!in_server && !in_up && sn == 1 && s[1] == "server") begin_server()
			else if (!in_server && !in_up && sn == 2 && s[1] == "upstream") { in_up = 1; udepth = depth + 1; up_name = s[2] }
			depth++
			sn = 0
		}
		function close_block() {
			if (!(sn < 1)) end_stmt()
			depth--
			if (in_server && depth < sdepth) {
				in_server = 0
				if (vn < 200) {
					vn++
					v_file[vn] = FILENAME; v_names[vn] = names
					v_root[vn] = (root != "" ? root : root_loc)
					v_proxy[vn] = proxy; v_php[vn] = php; v_ssl[vn] = ssl; v_listen[vn] = listen
				}
			}
			if (in_up && depth < udepth) in_up = 0
			sn = 0
		}
		function end_stmt(   k, p, j) {
			k = s[1]
			if (in_server) {
				if (k == "server_name") { for (j = 2; j <= sn; j++) names = names " " unq(s[j]) }
				else if (k == "root" && depth == sdepth && root == "") root = unq(s[2])
				else if (k == "root" && root_loc == "") root_loc = unq(s[2])
				else if (k == "proxy_pass" && proxy == "") proxy = unq(s[2])
				else if (k == "fastcgi_pass") php = 1
				else if (k == "ssl_certificate") ssl = 1
				else if (k == "listen" && !(sn < 2)) {
					p = s[2]
					if (p !~ /^unix:/) {
						sub(/^.*:/, "", p)
						if (p ~ /^[0-9]+$/ && index(" " listen " ", " " p " ") == 0) listen = listen " " p
						if (p == "443") ssl = 1
						for (j = 3; j <= sn; j++) if (s[j] == "ssl") ssl = 1
					}
				}
			} else if (in_up) {
				if (k == "server" && !(up_name in up_srv)) up_srv[up_name] = s[2]
			}
			sn = 0
		}
		FNR == 1 { depth = 0; in_server = 0; in_up = 0; sn = 0 }
		{
			line = $0
			sub(/#.*/, "", line)
			gsub(/[{};]/, " & ", line)
			n = split(line, w, /[ \t\r]+/)
			for (i = 1; i <= n; i++) {
				t = w[i]
				if (t == "") continue
				if (t == "{") open_block()
				else if (t == "}") close_block()
				else if (t == ";") end_stmt()
				else { sn++; s[sn] = t }
			}
		}
		END {
			for (i = 1; i <= vn; i++) {
				nn = split(v_names[i], parts, " ")
				list = ""; cnt = 0
				for (j = 1; j <= nn; j++) {
					nm = parts[j]
					if (nm == "" || !ok(nm) || !(length(nm) < 254) || !(cnt < 20)) continue
					list = list (cnt == 0 ? "" : ",") "\"" nm "\""
					cnt++
				}
				root = v_root[i]
				if (root !~ /^\// || !ok(root)) root = ""
				sub(/\/+$/, "", root)
				px = v_proxy[i]
				sub(/^[A-Za-z]+:\/\//, "", px)
				sub(/\/.*$/, "", px)
				sub(/^[^@]*@/, "", px)
				if (px in up_srv) px = up_srv[px]
				if (!ok(px) || !(length(px) < 254)) px = ""
				ports = v_listen[i]; gsub(/^ +/, "", ports); gsub(/ +/, ",", ports)
				if (!ok(v_file[i])) continue
				printf "{\"rec\":\"vhost\",\"file\":\"%s\",\"names\":[%s]", v_file[i], list
				if (root != "") printf ",\"root\":\"%s\"", root
				if (px != "") printf ",\"proxy\":\"%s\"", px
				printf ",\"ssl\":%s,\"php\":%s,\"listen\":[%s]}\n", (v_ssl[i] ? "true" : "false"), (v_php[i] ? "true" : "false"), ports
				if (root != "") print "#dir " root
			}
		}' $_files)
	unset IFS
	take "$_out"
}

# ------------------------------------------------------------------- compose

disc_compose() {
	has docker || return 0
	docker_ok 10
	_state=$?
	case $_state in
	0) ;;
	2)
		printf '{"rec":"note","code":"docker_no_permission"}\n'
		return 0
		;;
	*)
		printf '{"rec":"note","code":"docker_stopped"}\n'
		return 0
		;;
	esac
	_fmt='{{.Label "com.docker.compose.project"}}'"$TAB"'{{.Label "com.docker.compose.project.working_dir"}}'"$TAB"'{{.Label "com.docker.compose.service"}}'"$TAB"'{{.Label "com.docker.compose.oneoff"}}'"$TAB"'{{.Names}}'"$TAB"'{{.Image}}'"$TAB"'{{.State}}'"$TAB"'{{.Ports}}'
	_rows=$(run_for 15 docker ps -a --format "$_fmt") && _docker_listed=1
	_out=$(printf '%s\n' "$_rows" | awk -F '\t' '
		function ok(s) { return s !~ /["\\]/ && s !~ /[[:cntrl:]]/ }
		!(NF < 8) && ok($1) && ok($2) && ok($3) && ok($5) && ok($6) && ok($8) {
			proj = $1; dir = $2; svc = $3; oneoff = $4; name = $5; img = tolower($6); state = $7; ports = $8
			sub(/^.*\//, "", img); sub(/[:@].*$/, "", img)
			eng = ""
			if (img == "mysql" || img == "mariadb" || img == "percona") eng = "mysql"
			else if (img == "postgres" || img == "postgresql" || img == "postgis" || img == "timescaledb") eng = "postgres"
			if (eng != "" && dn < 20) {
				dn++; d_eng[dn] = eng; d_name[dn] = name; d_proj[dn] = proj
			}
			if (proj != "" && oneoff != "True" && oneoff != "true") {
				if (!(proj in seen)) { np++; seen[proj] = np; plist[np] = proj; pdir[proj] = dir }
				total[proj]++
				if (state == "running") running[proj]++
				if (svc != "" && !((proj SUBSEP svc) in svc_seen) && nsvc[proj] < 30) {
					svc_seen[proj, svc] = 1; nsvc[proj]++
					svcs[proj] = svcs[proj] (svcs[proj] == "" ? "" : ",") "\"" svc "\""
				}
				m = split(ports, pp, /, */)
				for (k = 1; k <= m; k++) {
					if (match(pp[k], /:[0-9]+-\076/)) {
						hp = substr(pp[k], RSTART + 1, RLENGTH - 3)
						if (!((proj SUBSEP hp) in hp_seen) && nhp[proj] < 30) {
							hp_seen[proj, hp] = 1; nhp[proj]++
							hports[proj] = hports[proj] (hports[proj] == "" ? "" : ",") hp
						}
					}
				}
			}
		}
		END {
			for (i = 1; i <= np && i <= 100; i++) {
				p = plist[i]
				printf "{\"rec\":\"compose\",\"project\":\"%s\"", p
				if (pdir[p] ~ /^\//) printf ",\"dir\":\"%s\"", pdir[p]
				printf ",\"services\":[%s],\"running\":%d,\"total\":%d,\"ports\":[%s]}\n", svcs[p], running[p] + 0, total[p] + 0, hports[p]
				if (pdir[p] ~ /^\//) print "#dir " pdir[p]
			}
			for (i = 1; i <= dn; i++) {
				printf "{\"rec\":\"db\",\"engine\":\"%s\",\"origin\":\"container\",\"name\":\"%s\"", d_eng[i], d_name[i]
				if (d_proj[i] != "") printf ",\"project\":\"%s\"", d_proj[i]
				printf "}\n"
			}
		}')
	take "$_out"
}

# ----------------------------------------------------------------------- pm2

# pm2_apps HOME DEFAULT: the apps of the pm2 daemon under HOME, one record
# each (cluster instances counted together).
pm2_apps() {
	_rows=$(
		# shellcheck disable=SC2030 # the daemon asked is set in this subshell only
		PM2_HOME=$1
		export PM2_HOME
		run_light pm2 jlist | pm2_rows cwd
	)
	_out=$(printf '%s\n' "$_rows" | awk -F '\t' -v home="$1" -v dflt="$2" '
		function ok(s) { return s !~ /["\\]/ && s !~ /[[:cntrl:]]/ }
		NF == 7 && $1 != "" && ok($1) && ok($3) && ok($7) && ok(home) {
			a = $1
			if (!(a in seen)) { n++; seen[a] = n; list[n] = a; cwd[a] = $7 }
			inst[a]++
			st = $3
			if (st != "online" && st != "stopping" && st != "stopped" && st != "launching" && st != "errored" && st != "one-launch-status" && st != "waiting restart") st = "unknown"
			if (status[a] == "" || status[a] == "online") status[a] = st
		}
		END {
			for (i = 1; i <= n && i <= 100; i++) {
				a = list[i]
				printf "{\"rec\":\"pm2\",\"app\":\"%s\",\"home\":\"%s\",\"default\":%s,\"instances\":%d,\"status\":\"%s\"", a, home, (dflt == "1" ? "true" : "false"), inst[a], status[a]
				if (cwd[a] ~ /^\//) printf ",\"cwd\":\"%s\"", cwd[a]
				printf "}\n"
				if (cwd[a] ~ /^\//) print "#dir " cwd[a]
			}
		}')
	take "$_out"
}

disc_pm2() {
	# shellcheck disable=SC2031 # the PM2_HOME of this session, not the subshell's
	_default=${PM2_HOME:-$HOME/.pm2}
	_homes=$_default
	set +f
	for _h in /home/*/.pm2 /root/.pm2; do
		case $_h in *"*"*) continue ;; esac
		[ "$_h" = "$_default" ] || _homes="$_homes$NL$_h"
	done
	set -f
	IFS=$NL
	for _h in $_homes; do
		unset IFS
		[ -n "$_h" ] || continue
		_is_default=0
		[ "$_h" = "$_default" ] && _is_default=1
		pm2_state "$_h"
		case $? in
		0)
			if has pm2; then
				pm2_apps "$_h" "$_is_default"
			else
				printf '{"rec":"note","code":"pm2_missing"}\n'
			fi
			;;
		2)
			case $_h in
			*[!A-Za-z0-9._/-]*) ;;
			*) printf '{"rec":"pm2_home","home":"%s","state":"needs_perm"}\n' "$_h" ;;
			esac
			;;
		esac
		IFS=$NL
	done
	unset IFS
}

# ------------------------------------------------------------------ database

# Database servers running here as processes, by the name the kernel keeps
# in /proc/PID/comm (never the command line). Once `docker ps` listed the
# containers, a process in a Docker container's cgroup is skipped: the host
# sees it, but its container is already listed. Other runtimes (podman, LXC,
# Kubernetes) are not listed as containers, so their databases stay here.
disc_db() {
	_proc=${DAMINUS_PROC:-/proc}
	_found=" "
	set +f
	for _d in "$_proc"/[0-9]*; do
		[ -r "$_d/comm" ] || continue
		_n=""
		read -r _n <"$_d/comm"
		case $_n in
		mysqld | mariadbd) _e=mysql ;;
		postgres | postmaster) _e=postgres ;;
		*) continue ;;
		esac
		if [ "${_docker_listed-}" = 1 ] && [ -r "$_d/cgroup" ]; then
			_cg=""
			while IFS= read -r _l; do _cg="$_cg $_l"; done <"$_d/cgroup"
			case $_cg in */docker-*.scope* | */docker/*) continue ;; esac
		fi
		case $_found in *" $_e "*) continue ;; esac
		_found="$_found$_e "
		printf '{"rec":"db","engine":"%s","origin":"process","name":%s}\n' "$_e" "$(json_str "$_n")"
	done
	set -f
}

# --------------------------------------------------------------------- ports

# Listening TCP ports with who holds them. The holder is found through the
# socket links of the SSH user's own processes, like sec.ports; for another
# user's process the name and folder stay empty.
disc_ports() {
	_proc=${DAMINUS_PROC:-/proc}
	[ -r "$_proc/net/tcp" ] || return 0
	_listen=""
	for _t in tcp tcp6; do
		[ -r "$_proc/net/$_t" ] || continue
		_rows=$(awk '
			function hex(h,   i, v) {
				v = 0
				for (i = 1; i <= length(h); i++) v = v * 16 + index("0123456789ABCDEF", substr(h, i, 1)) - 1
				return v
			}
			$4 == "0A" {
				split($2, a, ":")
				addr = toupper(a[1])
				if (addr ~ /^0+$/ || addr == "0000000000000000FFFF000000000000") bind = "any"
				else if (length(addr) == 8 && addr ~ /7F$/) bind = "loopback"
				else if (addr == "00000000000000000000000001000000" || (length(addr) == 32 && addr ~ /^0000000000000000FFFF0000.*7F$/)) bind = "loopback"
				else bind = "other"
				print hex(a[2]) "\t" bind "\t" $10
			}' "$_proc/net/$_t")
		[ -z "$_rows" ] || _listen="$_listen${_listen:+$NL}$_rows"
	done
	[ -n "$_listen" ] || return 0
	_socks=""
	_fok=0
	if find_ok; then
		_fok=1
		_left=$(group_left "$BUDGET_S")
		if [ "$_left" -ge 3 ]; then
			_socks=$(run_for "$_left" find "$_proc" -maxdepth 3 -path "$_proc/[0-9]*/fd/*" -lname 'socket:*' -printf '%l\t%P\n')
		fi
	fi
	# Port, bind, pid of the holder (empty when not ours).
	_holders=$({
		printf '%s\n--\n' "$_listen"
		printf '%s\n' "$_socks"
	} | awk -F '\t' '
		$0 == "--" { second = 1; next }
		!second { n++; port[n] = $1; bind[n] = $2; ino[n] = $3; want[$3] = n; next }
		{
			i = $1
			sub(/^socket:\[/, "", i); sub(/\]$/, "", i)
			if (i in want && !(want[i] in pid)) { split($2, p, "/"); pid[want[i]] = p[1] }
		}
		END {
			for (k = 1; k <= n; k++) {
				key = port[k] SUBSEP bind[k]
				if (key in done || !(shown < 60)) continue
				done[key] = 1; shown++
				print port[k] "\t" bind[k] "\t" pid[k]
			}
		}')
	IFS=$NL
	for _row in $_holders; do
		unset IFS
		# shellcheck disable=SC2295 # $TAB is a literal tab, not a pattern
		_port=${_row%%$TAB*}
		# shellcheck disable=SC2295
		_rest=${_row#*$TAB}
		# shellcheck disable=SC2295
		_bind=${_rest%%$TAB*}
		# shellcheck disable=SC2295
		_pid=${_rest#*$TAB}
		is_num "$_port" || continue
		_name=""
		_cwd=""
		case $_pid in
		'' | *[!0-9]*) ;;
		*)
			[ -r "$_proc/$_pid/comm" ] && read -r _name <"$_proc/$_pid/comm"
			if [ "$_fok" = 1 ]; then
				_cwd=$(find "$_proc/$_pid" -maxdepth 1 -name cwd -printf '%l')
			fi
			;;
		esac
		_rec=$(printf '{"rec":"port","port":%s,"bind":"%s"' "$_port" "$_bind")
		[ -z "$_name" ] || _rec="$_rec,\"proc\":$(json_str "$_name")"
		case $_cwd in
		/*)
			_rec="$_rec,\"cwd\":$(json_str "$_cwd")"
			dirs="$dirs$NL$_cwd"
			;;
		esac
		printf '%s}\n' "$_rec"
		IFS=$NL
	done
	unset IFS
}

# -------------------------------------------------------------------- .env

# Where .env files may live: folders found above and their parents (a vhost
# root is usually `<project>/public`), plus the usual places for code, to a
# depth of 3. Only names are listed; no file is opened, only tested with -r.
disc_env() {
	find_ok || return 0
	_left=$(group_left "$BUDGET_S")
	[ "$_left" -ge 3 ] || return 0
	# The folders found above with up to two parents each, never the places
	# every site shares (they would pull in unrelated projects).
	_cands=""
	IFS=$NL
	for _d in $dirs; do
		unset IFS
		_x=$_d
		_k=0
		while [ "$_k" -lt 3 ] && [ -n "$_x" ] && [ -d "$_x" ]; do
			case $_x in
			/ | /var | /var/www | /var/www/html | /www | /www/wwwroot | /srv | /opt | /home | /usr | /usr/share | /etc | /root | /usr/share/nginx | /usr/share/nginx/html) ;;
			/home/*/*) _cands="$_cands$_x$NL" ;;
			/home/*) ;;
			*) _cands="$_cands$_x$NL" ;;
			esac
			_x=${_x%/*}
			_k=$((_k + 1))
		done
		IFS=$NL
	done
	unset IFS
	_roots=""
	for _r in /var/www /www/wwwroot /srv /opt /home /data /app; do
		[ -d "$_r" ] && _roots="$_roots$_r$NL"
	done
	_found=""
	if [ -n "$_roots" ]; then
		IFS=$NL
		# shellcheck disable=SC2046,SC2086 # split on newlines only, with globbing off
		set -- $_roots -maxdepth 3 $(skip_expr node_modules vendor .git .cache .npm)
		unset IFS
		_found=$(run_for "$_left" find "$@" -type f "(" -name '.env' -o -name '.env.*' ")" ! -name '*.example' ! -name '*.sample' ! -name '*.dist' ! -name '*.template' ! -name '*.tpl' ! -name '*.bak*' ! -name '*.orig*' ! -name '*.old*' ! -name '*.backup*' -printf '%p\0' | tr '\012\000' '?\012')
	fi
	_left=$(group_left "$BUDGET_S")
	if [ -n "$_cands" ] && [ "$_left" -ge 2 ]; then
		IFS=$NL
		# shellcheck disable=SC2086 # split on newlines only, with globbing off
		set -- $_cands -maxdepth 1
		unset IFS
		_more=$(run_for "$_left" find "$@" -type f "(" -name '.env' -o -name '.env.*' ")" ! -name '*.example' ! -name '*.sample' ! -name '*.dist' ! -name '*.template' ! -name '*.tpl' ! -name '*.bak*' ! -name '*.orig*' ! -name '*.old*' ! -name '*.backup*' -printf '%p\0' | tr '\012\000' '?\012')
		_found="$_found$NL$_more"
	fi
	_n=0
	_sorted=$(printf '%s\n' "$_found" | sort -u)
	IFS=$NL
	for _f in $_sorted; do
		unset IFS
		[ -n "$_f" ] || continue
		[ "$_n" -lt 100 ] || break
		case $_f in
		/*) ;;
		*) continue ;;
		esac
		_n=$((_n + 1))
		_r=false
		[ -r "$_f" ] && _r=true
		printf '{"rec":"env","path":%s,"readable":%s}\n' "$(json_str "$_f")" "$_r"
		IFS=$NL
	done
	unset IFS
}

disc_nginx
disc_compose
disc_pm2
disc_db
disc_ports
disc_env
