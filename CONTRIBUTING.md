# Contributing to Daminus

Thanks for your interest! Daminus is in early development, so the codebase and these guidelines will change.

## Before you start

- **Bugs and features:** open an issue using one of the templates. For anything larger than a small fix, discuss it in an issue before writing code, so your work doesn't go to waste.
- **Questions:** use [Discussions](https://github.com/locflamedia/daminus/discussions), not issues.
- **Security issues:** see [SECURITY.md](SECURITY.md). Do not open a public issue.

## Development setup

You will need:

- [Rust](https://rustup.rs) (stable, 1.88 or newer)
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
shellcheck scripts/*.sh
cargo deny check
```

See [docs/code-standards.md](docs/code-standards.md) and [docs/system-architecture.md](docs/system-architecture.md).

## Writing a check

Checks are the easiest way to contribute. They live in `crates/core/checks/`. A step-by-step guide lands together with the check runtime; the rules below already apply:

- POSIX `sh` only (no bash-isms), because servers can be Debian, Ubuntu, and so on.
- **Read-only.** A check must never write, delete, restart, or install anything, and never uses `sudo`. CI rejects write commands.
- Report numbers and facts only, one JSON object per line. The app decides severity from thresholds in the check manifest.
- Never print secrets. Read `.env` on the server only to reach a database, and emit only the resulting numbers.
- Degrade gracefully when a tool is missing or a permission is lacking, instead of failing.
- Must pass `shellcheck`.

## Pull requests

- Keep PRs focused on one change.
- Use [Conventional Commits](https://www.conventionalcommits.org) for commit messages, e.g. `feat(checks): add redis memory check` or `fix(scan): handle ssh timeout`.
- Make sure CI passes (lint, tests, shellcheck).
- Add screenshots for UI changes.
- Never commit secrets, `.env` files, real hostnames, or IP addresses. Use placeholders like `vps-a` and `example.com`.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
