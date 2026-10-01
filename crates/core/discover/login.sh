# login: who the SSH user is on this host and what it may do, for the setup
# screens' "test login". Read-only, like a check, and it opens no project
# file: a folder is only tested for being readable.
#   {"rec":"login", ...}   the system, the user, its groups, docker access
#   {"rec":"path", ...}    one per folder in DAMINUS_PATHS (optional, one
#                          absolute path per line): readable, denied or missing
# Groups are reduced to the three that matter here: docker (use the docker
# daemon), adm (read system logs) and systemd-journal (read the journal).

os=""
kernel=""
arch=""
if has uname; then
	os=$(uname -s)
	kernel=$(uname -r)
	arch=$(uname -m)
fi

distro=""
if [ -r /etc/os-release ]; then
	distro=$(awk -F= '$1 == "PRETTY_NAME" { v = $2; gsub(/"/, "", v); print v; exit }' /etc/os-release)
fi

user=""
uid=0
groups=""
if has id; then
	user=$(id -un)
	uid=$(id -u)
	groups=$(id -Gn)
fi
is_num "$uid" || uid=0

# in_group NAME: true or false, as JSON.
in_group() {
	case " $groups " in
	*" $1 "*) printf true ;;
	*) printf false ;;
	esac
}

root=false
[ "$uid" = 0 ] && root=true

# docker: ok (the daemon answers), no_permission (the socket is there but
# this user may not use it), stopped (no daemon) or missing (no docker).
docker=missing
if has docker; then
	docker_ok 10
	case $? in
	0) docker=ok ;;
	2) docker=no_permission ;;
	*) docker=stopped ;;
	esac
fi

gnu_find=false
if find_ok; then
	gnu_find=true
fi

printf '{"rec":"login","os":%s,"kernel":%s,"arch":%s,"distro":%s,"user":%s,"uid":%s,"root":%s,"docker_group":%s,"adm_group":%s,"journal_group":%s,"docker":"%s","gnu_find":%s}\n' "$(json_str "$os")" "$(json_str "$kernel")" "$(json_str "$arch")" "$(json_str "$distro")" "$(json_str "$user")" "$uid" "$root" "$(in_group docker)" "$(in_group adm)" "$(in_group systemd-journal)" "$docker" "$gnu_find"

# The project folders to test: readable, denied (it exists but cannot be
# entered, or sits inside a folder that cannot be) or missing.
set -f
IFS=$NL
for p in ${DAMINUS_PATHS-}; do
	unset IFS
	if [ -z "$p" ]; then
		IFS=$NL
		continue
	fi
	up=${p%/*}
	if [ -e "$p" ]; then
		if [ -d "$p" ] && [ -r "$p" ] && [ -x "$p" ]; then
			st=readable
		else
			st=denied
		fi
	elif [ -n "$up" ] && [ -d "$up" ] && [ ! -x "$up" ]; then
		st=denied
	else
		st=missing
	fi
	printf '{"rec":"path","path":%s,"state":"%s"}\n' "$(json_str "$p")" "$st"
	IFS=$NL
done
unset IFS
