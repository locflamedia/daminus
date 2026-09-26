# Contributing to Daminus

Thanks for your interest! Daminus is in early development, so the codebase and these guidelines will change.

## Before you start

- **Bugs and features:** open an issue using one of the templates. For anything larger than a small fix, discuss it in an issue before writing code, so your work doesn't go to waste.
- **Questions:** use [Discussions](https://github.com/locflamedia/daminus/discussions), not issues.
- **Security issues:** see [SECURITY.md](SECURITY.md). Do not open a public issue.

## Development setup

> The app scaffold is not in the repo yet. This section will be filled in once it lands.

You will need:

- [Rust](https://rustup.rs) (stable)
- Node.js 20+ and pnpm
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS
- `shellcheck` for check scripts

## Writing a check

Checks are the easiest way to contribute. Each check is one file in `checks/`:

- POSIX `sh` only (no bash-isms), because servers can be Alpine, Debian, Ubuntu, and so on.
- **Read-only.** A check must never write, delete, restart, or install anything. CI rejects write commands.
- Print one JSON object per line with at least `check` and `status` fields.
- Degrade gracefully when a tool is missing: report `status: "skip"` instead of failing.
- Must pass `shellcheck`.

## Pull requests

- Keep PRs focused on one change.
- Use [Conventional Commits](https://www.conventionalcommits.org) for commit messages, e.g. `feat(checks): add redis memory check` or `fix(scan): handle ssh timeout`.
- Make sure CI passes (lint, tests, shellcheck).
- Add screenshots for UI changes.
- Never commit secrets, `.env` files, real hostnames, or IP addresses. Use placeholders like `vps-a` and `example.com`.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
