# db.size: size of each database component on this host (DAMINUS_DB: one
# entry per line, `engine TAB database TAB env_file TAB container`, the
# container empty when the client runs on the host) and its five largest
# tables.
#
# Credentials are read on the server from env_file and never leave it. The
# file is read as text (a hand-written KEY=VALUE reader), never sourced or
# evaluated. The password reaches the client without touching argv or disk:
#   MySQL     printf (a builtin) pipes an option file to
#             `mysql --defaults-extra-file=/dev/stdin`, also through
#             `docker exec -i`;
#   Postgres  PGPASSWORD (and PGUSER) are exported, and `docker exec -e NAME`
#             passes only the names.
# The only SQL is the two constants below (CI checks that nothing else is
# run). Every client call drops stderr, and the result depends on the exit
# code alone: no user, host or error text ends up in a fact.

[ -n "${DAMINUS_DB-}" ] || exit 0

# One result set per query: a row 0 `count, total bytes`, then up to five
# rows 1 `table, bytes`. Sizes are what the engine reports (MySQL 8 caches
# table statistics for 24 h by default).
Q_MYSQL='(SELECT 0, COUNT(*), COALESCE(SUM(data_length + index_length), 0) FROM information_schema.tables WHERE table_schema = DATABASE() AND engine IS NOT NULL) UNION ALL (SELECT 1, table_name, data_length + index_length FROM information_schema.tables WHERE table_schema = DATABASE() AND engine IS NOT NULL ORDER BY 3 DESC, 2 LIMIT 5) ORDER BY 1, 3 DESC, 2'
Q_PG='SELECT 0, CAST((SELECT COUNT(*) FROM pg_stat_user_tables) AS text), pg_database_size(datname) FROM pg_database WHERE datname = current_database() UNION ALL (SELECT 1, relname, pg_total_relation_size(relid) FROM pg_stat_user_tables ORDER BY 3 DESC, 2 LIMIT 5) ORDER BY 1, 3 DESC, 2'

# env_get KEY: the value of KEY in the dotenv text $_env. Prints it; returns
# 0 when found, 1 when KEY is not there, 2 when its value is not plain
# (inside double quotes a backslash other than `\\` and `\"`, `${`, or an
# unclosed quote). The last assignment wins.
# A line is KEY=VALUE, with an optional `export ` before it; a value is
# "double quoted", 'single quoted' or bare (cut at a space and `#`).
# shellcheck disable=SC2295 # KEY is a plain name, so it is no glob.
env_get() {
	printf '%s\n' "$_env" | {
		_v=""
		_st=1
		while IFS= read -r _l; do
			case $_l in
			"$1="*) ;;
			*) continue ;;
			esac
			_v=${_l#$1=}
			case $_v in
			\"*)
				# Up to the first unescaped quote; `\\` and `\"` are decoded, any
				# other backslash or a missing closing quote is not plain. A line
				# that matches comes back as `=` and the decoded text.
				_v=$(printf '%s\n' "$_v" | sed -e 's/^"\(\([^\\"]*\\[\\"]\)*[^\\"]*\)".*$/=\1/' -e 's/\\\([\\"]\)/\1/g')
				case $_v in
				=*)
					_v=${_v#=}
					_st=0
					;;
				*)
					_v=""
					_st=2
					;;
				esac
				# `${NAME}` is expanded by most dotenv readers inside double
				# quotes, so the text here may not be the password.
				case $_v in
				*\$\{*) _st=2 ;;
				esac
				;;
			\'*)
				_v=${_v#\'}
				case $_v in
				*\'*)
					_v=${_v%%\'*}
					_st=0
					;;
				*) _st=2 ;;
				esac
				;;
			*)
				_v=${_v%% #*}
				_v=${_v%%$TAB#*}
				while :; do
					case $_v in
					*" " | *"$TAB") _v=${_v%?} ;;
					*) break ;;
					esac
				done
				_st=0
				;;
			esac
		done
		printf '%s' "$_v"
		exit "$_st"
	}
}

# read_key KEY: _val = the value of KEY, _got = 1 when it is set, and _bad = 1
# when its value is not plain.
read_key() {
	_val=$(env_get "$1")
	case $? in
	0) _got=1 ;;
	1) _got=0 ;;
	*)
		_got=0
		_bad=1
		;;
	esac
}

# simple_url URL ENGINE: scheme://user[:password]@host[:port][/database] with
# no query, no percent-encoding, no IPv6 host. Sets _user _pass _host _port.
simple_url() {
	case $1 in *://*) ;; *) return 1 ;; esac
	_scheme=${1%%://*}
	case $2:$_scheme in
	mysql:mysql | mysql:mysql2 | mysql:mariadb | postgres:postgres | postgres:postgresql | postgres:pgsql) ;;
	*) return 1 ;;
	esac
	_rest=${1#*://}
	case $_rest in *\?* | *%* | *\[* | *\\* | *\#*) return 1 ;; esac
	_auth=${_rest%%/*}
	case $_rest in
	*/*)
		_path=${_rest#*/}
		case $_path in */*) return 1 ;; esac
		;;
	esac
	case $_auth in *@*) ;; *) return 1 ;; esac
	_ui=${_auth%@*}
	_hp=${_auth##*@}
	case $_ui in
	*:*)
		_user=${_ui%%:*}
		_pass=${_ui#*:}
		;;
	*) _user=$_ui ;;
	esac
	case $_hp in
	*:*)
		_host=${_hp%%:*}
		_port=${_hp#*:}
		;;
	*) _host=$_hp ;;
	esac
	[ -n "$_user" ]
}

# find_creds ENGINE: fills _user _pass _host _port from $_env, first match of
#   DB_USERNAME (or DB_USER) with DB_PASSWORD, DB_HOST, DB_PORT;
#   DATABASE_URL;
#   MYSQL_USER or POSTGRES_USER (MySQL falls back to root and
#   MYSQL_ROOT_PASSWORD) with the same prefix's PASSWORD, HOST, PORT.
# Returns 0 when found, 1 when the file has none of these, 2 when it has
# one the reader cannot take as it is.
find_creds() {
	_user=""
	_pass=""
	_host=""
	_port=""
	_bad=0
	read_key DB_USERNAME
	if [ "$_got" = 0 ]; then read_key DB_USER; fi
	if [ "$_got" = 1 ]; then
		_user=$_val
		read_key DB_PASSWORD
		_pass=$_val
		read_key DB_HOST
		_host=$_val
		read_key DB_PORT
		_port=$_val
		[ "$_bad" = 0 ] || return 2
		return 0
	fi
	read_key DATABASE_URL
	[ "$_bad" = 0 ] || return 2
	if [ "$_got" = 1 ]; then
		simple_url "$_val" "$1" || return 2
		return 0
	fi
	case $1 in mysql) _p=MYSQL ;; *) _p=POSTGRES ;; esac
	read_key "${_p}_USER"
	if [ "$_got" = 1 ]; then
		_user=$_val
		read_key "${_p}_PASSWORD"
		_pass=$_val
	else
		# The images' own default login when only a password is set.
		case $1 in
		mysql)
			_fb=MYSQL_ROOT_PASSWORD
			_fu=root
			;;
		*)
			_fb=POSTGRES_PASSWORD
			_fu=postgres
			;;
		esac
		read_key "$_fb"
		if [ "$_got" = 0 ]; then
			[ "$_bad" = 0 ] || return 2
			return 1
		fi
		_user=$_fu
		_pass=$_val
	fi
	read_key "${_p}_HOST"
	_host=$_val
	read_key "${_p}_PORT"
	_port=$_val
	[ "$_bad" = 0 ] || return 2
	return 0
}

# esc S: S for inside the double quotes of an option file.
esc() {
	printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# db_one ENGINE DATABASE ENV_FILE CONTAINER: one fact for one database.
# budget: sets _gl to the seconds left of the group's allowance, which bound
# the next call. When none is left, ends the database as a timeout.
budget() {
	_gl=$(group_left 40)
	if [ "$_gl" -le 0 ]; then
		emit_unknown db.size "$database" timeout
		exit 0
	fi
}

db_one() (
	engine=$1
	database=$2
	env_file=$3
	container=$4
	case $engine in mysql | postgres) ;; *)
		emit_unknown db.size "$database" unsupported
		exit 0
		;;
	esac
	case $database in -* | *[!A-Za-z0-9._-]*)
		emit_unknown db.size "$database" unsupported
		exit 0
		;;
	esac
	case $container in -* | *[!A-Za-z0-9._-]*)
		emit_unknown db.size "$database" unsupported
		exit 0
		;;
	esac

	if [ ! -e "$env_file" ]; then
		# Inside another user's closed folder it cannot even be seen.
		_up=${env_file%/*}
		if [ -n "$_up" ] && [ -d "$_up" ] && [ ! -x "$_up" ]; then
			perm_missing db.size "$database"
		else
			emit_unknown db.size "$database" missing
		fi
		exit 0
	fi
	if [ ! -f "$env_file" ] || [ ! -r "$env_file" ]; then
		perm_missing db.size "$database"
		exit 0
	fi
	_env=$(tr -d '\r' <"$env_file" | sed -e 's/^[[:space:]]*export[[:space:]][[:space:]]*//' -e 's/^[[:space:]]*//')
	find_creds "$engine"
	case $? in
	0) ;;
	*)
		emit_unknown db.size "$database" unsupported
		exit 0
		;;
	esac
	case $_host in -* | *[!A-Za-z0-9._-]*)
		emit_unknown db.size "$database" unsupported
		exit 0
		;;
	esac
	case $_port in *[!0-9]*)
		emit_unknown db.size "$database" unsupported
		exit 0
		;;
	esac

	if [ -n "$container" ]; then
		case $dk in
		0) ;;
		2)
			perm_missing db.size "$database"
			exit 0
			;;
		124)
			emit_unknown db.size "$database" timeout
			exit 0
			;;
		*)
			emit_unknown db.size "$database" missing
			exit 0
			;;
		esac
		budget
		running=$(run_for "$_gl" docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null)
		case $? in
		124 | 137)
			emit_unknown db.size "$database" timeout
			exit 0
			;;
		esac
		if [ "$running" != true ]; then
			emit_unknown db.size "$database" missing
			exit 0
		fi
		_host=""
		_port=""
	else
		case $engine in mysql) _client=mysql ;; *) _client=psql ;; esac
		if ! has "$_client"; then
			emit_unknown db.size "$database" missing
			exit 0
		fi
	fi
	budget

	case $engine in
	mysql)
		_cu=$(esc "$_user")
		_cp=$(esc "$_pass")
		_extra=""
		[ -z "$_host" ] || _extra="host=$_host$NL"
		[ -z "$_port" ] || _extra="${_extra}port=$_port$NL"
		if [ -n "$container" ]; then
			out=$(printf '[client]\nuser="%s"\npassword="%s"\n%s' "$_cu" "$_cp" "$_extra" | run_for "$_gl" docker exec -i "$container" mysql --defaults-extra-file=/dev/stdin --connect-timeout=10 -N -B -e "$Q_MYSQL" "$database" 2>/dev/null)
		else
			out=$(printf '[client]\nuser="%s"\npassword="%s"\n%s' "$_cu" "$_cp" "$_extra" | run_for "$_gl" mysql --defaults-extra-file=/dev/stdin --connect-timeout=10 -N -B -e "$Q_MYSQL" "$database" 2>/dev/null)
		fi
		rc=$?
		;;
	*)
		PGUSER=$_user
		PGPASSWORD=$_pass
		PGCONNECT_TIMEOUT=10
		export PGUSER PGPASSWORD PGCONNECT_TIMEOUT
		if [ -n "$container" ]; then
			out=$(run_for "$_gl" docker exec -e PGUSER -e PGPASSWORD -e PGCONNECT_TIMEOUT "$container" psql -X -w -A -t -F "$TAB" -d "$database" -c "$Q_PG" 2>/dev/null)
		else
			if [ -n "$_host" ]; then
				PGHOST=$_host
				export PGHOST
			fi
			if [ -n "$_port" ]; then
				PGPORT=$_port
				export PGPORT
			fi
			out=$(run_for "$_gl" psql -X -w -A -t -F "$TAB" -d "$database" -c "$Q_PG" 2>/dev/null)
		fi
		rc=$?
		;;
	esac
	case $rc in
	0) ;;
	124 | 137)
		emit_unknown db.size "$database" timeout
		exit 0
		;;
	126 | 127)
		emit_unknown db.size "$database" missing
		exit 0
		;;
	*)
		# A refused login, an unreachable server or a database the user may
		# not open all look the same here, and the reason is not shown.
		perm_missing db.size "$database"
		exit 0
		;;
	esac

	# Prints: total_bytes TAB data-object, or nothing when there was no total.
	line=$(printf '%s\n' "$out" | awk -F '\t' -v engine="$engine" '
		function jstr(s) {
			gsub(/[\\"]/, "?", s); gsub(/[[:cntrl:]]/, "", s)
			return "\"" s "\""
		}
		$1 == "0" && NF == 3 && $2 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+(\.[0-9]+)?$/ { n = $2; total = $3; have = 1 }
		$1 == "1" && NF == 3 && $3 ~ /^[0-9]+(\.[0-9]+)?$/ && k < 5 {
			k++
			top = top (top == "" ? "" : ",") sprintf("[%s,%.0f]", jstr($2), $3)
			sum += $3
		}
		END {
			if (!have) exit
			other = total - sum
			if (other < 0) other = 0
			printf "%.0f\t{\"engine\":\"%s\",\"tables\":%d,\"top\":[%s],\"other\":%.0f}\n", total, engine, n, top, other
		}')
	if [ -z "$line" ]; then
		emit_unknown db.size "$database" unsupported
		exit 0
	fi
	# shellcheck disable=SC2295 # the line holds no glob characters of its own.
	emit db.size "$database" "${line%%$TAB*}" bytes "${line#*$TAB}"
)

set -f
IFS=$NL
for entry in $DAMINUS_DB; do
	unset IFS
	[ -n "$entry" ] || continue
	# shellcheck disable=SC2295 # fields hold no glob characters.
	{
		engine=${entry%%$TAB*}
		rest=${entry#*$TAB}
		database=${rest%%$TAB*}
		rest=${rest#*$TAB}
		env_file=${rest%%$TAB*}
		container=${rest#*$TAB}
	}
	# The group shares one allowance: a few unreachable servers must not eat
	# the host's budget. Every call below is bounded by what is left of it, and
	# whether the docker daemon answers is asked once, for the first container.
	if [ -n "$container" ] && [ -z "${dk-}" ]; then
		_gl=$(group_left 40)
		if [ "$_gl" -le 0 ]; then
			dk=124
		else
			docker_ok "$_gl"
			dk=$?
		fi
	fi
	db_one "$engine" "$database" "$env_file" "$container"
done
