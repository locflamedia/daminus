# Contributing to Daminus

Thanks for your interest! Daminus is in early development, so the codebase and these guidelines will change.

## Before you start

- **Bugs and features:** open an issue using one of the templates. For anything larger than a small fix, discuss it in an issue before writing code, so your work doesn't go to waste.
- **Questions:** use [Discussions](https://github.com/locflamedia/daminus/discussions), not issues.
- **Security issues:** see [SECURITY.md](SECURITY.md). Do not open a public issue.

## Development setup

You will need:

- [Rust](https://rustup.rs) (stable, 1.89 or newer)
- Node.js 20.19+ and [pnpm](https://pnpm.io) 10
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS
- `shellcheck` for check scripts

```sh
pnpm install          # front-end dependencies (lockfile is committed)
pnpm tauri dev        # run the app with hot reload
```

Repository layout:

- `crates/core` — the core library (`daminus_core`), no Tauri. The dev CLI is behind a feature:
  `cargo run -p daminus-core --features cli --bin daminus-dev -- --help`
- `src-tauri` — the thin Tauri shell.
- `src` — the Vue 3 + TypeScript front end. Only `src/api/` may import `@tauri-apps/*`.
- `docs/` — architecture, Decision Log, code standards and ADRs.

Checks CI runs, which you can run locally before opening a PR:

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
./scripts/check-bindings.sh        # regenerate TS bindings; fails if they drift
./scripts/check-core-boundaries.sh # domain/ must not import I/O modules
./scripts/test-check-core-boundaries.sh # fixture test for the boundary check
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
git ls-files '*.sh' 'scripts/check-harness/bin/*' 'scripts/check-harness/db-bin/*' | xargs shellcheck
./scripts/check-harness/deny-list.sh  # quick grep for write commands in checks
./scripts/check-harness/run.sh        # checks in read-only containers (needs docker, jq)
./scripts/check-harness/db-real.sh    # db.size against real MySQL 8 and Postgres 16 (needs docker, jq)
./scripts/fake-server/e2e.sh          # the setup flow against a container with a real sshd (needs docker, jq)
cargo deny check
```

See [docs/code-standards.md](docs/code-standards.md) and [docs/system-architecture.md](docs/system-architecture.md).

## Adding a check

Checks are the easiest way to contribute. They live in `crates/core/checks/`, and a new one is four pieces:

1. **Script** `crates/core/checks/<id with _>.sh`, e.g. `sys_mem.sh` for `sys.mem`. It is the body of a function: the bundle wraps it in a subshell after `prelude.sh`, so `exit 0` ends only this check. Use the prelude helpers:
   - `emit CHECK TARGET [VALUE UNIT [DATA [FP]]]` prints one fact (DATA is a JSON object you build from validated numbers; strings go through `json_str`).
   - `emit_unknown CHECK TARGET REASON [DATA]` when the check cannot answer (`missing`, `unsupported`, `timeout`; DATA says how far it got); `perm_missing CHECK TARGET` when the SSH user lacks a permission.
   - `has CMD`, `is_num S`, and `run_light CMD…` for heavy reads (low CPU/IO priority, 20 s limit, exit 124 on timeout).
   - Limits from Settings arrive as variables: `DAMINUS_SKIP_PATHS` (one path per line) and `DAMINUS_LARGE_FILE_MB`. The host's components too: `DAMINUS_PATHS`, `DAMINUS_COMPOSE`, `DAMINUS_PM2` and `DAMINUS_DB` (one per line; split them with `IFS=$NL` and `set -f`, and put `IFS` back before calling `run_light`). `TAB` and `NL` hold a tab and a newline.
   - Evidence checks (security): `file_fp SIZE MTIME FILE` (fingerprint `size:mtime:sha12`, the SHA-256 of the first MiB), `sha12_text TEXT`, `top_recent N` (the N newest of `size TAB mtime TAB path` lines, after a count), `skip_expr [NAME…]` (the `find` expression that prunes the skip paths) and `find_ok` (GNU `find`; answer `unsupported` when it fails rather than call an unread folder clean). A finding has an `fp` and no `value` (a size of 0 would read as "found none"); "looked, found none" is one fact with value 0. Never read a process's command line or environment.
   - `docker_ok` (daemon answers / not there / no permission) and `pm2_state HOME` + `pm2_rows` for pm2: never call `pm2` or read `docker inspect` output any other way, since both carry process environments.
2. **One manifest entry** in `crates/core/checks/manifest.json`: `id`, `group`, `runs: "remote"`, `script`, `needs` (every external command the script runs), `facts` (what target, value, unit and data mean), `fp` if the check has evidence, and the severity `rule`. Add the file to `SCRIPTS` in `crates/core/src/checks/mod.rs`.
3. **Strings** `checks.<id>.name` and `checks.<id>.desc` in `src/i18n/en.json` and `src/i18n/vi.json` (the id's dots are nesting levels).
4. **Golden output**: `scripts/check-harness/run.sh --bless` writes `fixtures/ndjson/<distro>/<script>.ndjson` from a real run in `ubuntu:24.04` and `debian:12`. Commit it. Checks that report findings are also run in a container made to look compromised: plant what they look for in `scripts/check-harness/probe.sh` (`PLANT=1`), assert the finding with `jq` in `run.sh` (`check_infected`), and keep that output in `fixtures/ndjson/<distro>/infected/`; the golden next to it must come from the clean container. Add a severity case table for the rule next to the other rule tests (`crates/core/tests/check_severity.rs`).

The rules, all checked in CI (job `shell`):

- POSIX `sh` only (no bash-isms): servers run Debian, Ubuntu and so on, where `sh` is dash.
- **Read-only.** Never write, delete, restart, install, or use `sudo`. Every command must be a safe builtin, a prelude helper or listed in `needs` (allowlist test in `crates/core/tests/check_scripts.rs`); output redirection only to `/dev/null` or a numeric descriptor (`>&2`); no quotes inside `${…}` or `$((…))`; `sed` only `s///`; `awk` only with an inline program (no `-f`) that never pipes, writes or calls `system` (write comparisons with `<`); `find` never `-delete` or `-exec`; no here-documents. The bundle then runs in a container with a read-only root, as a normal user, and `$HOME` and `/tmp` must hash the same before and after.
- **Numbers and facts only.** The app decides severity from the manifest rule; scripts never compare against thresholds.
- **Never print secrets.** Read `.env` only to reach a database, as text (never `source` or `eval` it), and emit only the resulting numbers. A database client gets its login on stdin (an option file) or in `PG*` variables passed by name, never on its command line, and runs only constant `SELECT`/`SHOW` text kept in `Q_*` variables (the database tests in `check_scripts.rs` enforce both). The harness seeds `CANARY_*` values in the environment, project `.env` files and the docker/pm2 shims, and fails if one reaches stdout; `db-real.sh` does the same against real servers and also checks argument lists, `ps`, and that the data is unchanged.
- Degrade gracefully when a tool is missing or a permission is lacking, instead of failing.
- Must pass `shellcheck` (`crates/core/checks/.shellcheckrc` sets `shell=sh`).

## Changing the setup scripts

`crates/core/discover/login.sh` (the login test) and `discover.sh` (nginx server blocks, compose projects, pm2 apps, database servers, `.env` paths, listening ports) run on the user's servers like a check and follow the same rules: POSIX `sh`, read-only, allowlisted commands (`LOGIN_NEEDS` and `DISCOVER_NEEDS` in `crates/core/src/discover/mod.rs`), shellcheck, the grep deny-list, and the read-only container run, which also compares their records with `fixtures/discover/<distro>/` (`run.sh --bless` rewrites them) and checks them with `jq`. Two more rules: they print **records** (`{"rec":"…"}`), checked and capped by `RecordParser`, and they **never open a `.env`**: list it, test it with `-r`, nothing else (the harness `.env` files hold canary values; any that reach the output fail the run). The planted container's nginx config, docker/pm2 shims and listeners are in `scripts/check-harness/`. `scripts/fake-server/e2e.sh` runs the whole flow against a real sshd.

## Pull requests

- Keep PRs focused on one change.
- Use [Conventional Commits](https://www.conventionalcommits.org) for commit messages, e.g. `feat(checks): add redis memory check` or `fix(scan): handle ssh timeout`.
- Make sure CI passes (lint, tests, shellcheck).
- Add screenshots for UI changes.
- Never commit secrets, `.env` files, real hostnames, or IP addresses. Use placeholders like `vps-a` and `example.com`.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
