# Code standards

## Rust

- Errors: `thiserror` in `crates/core`; `anyhow` only in binaries and `src-tauri`.
- No `unwrap()` / `expect()` outside tests (clippy denies them; tests are allowed).
- Keep modules around 300 lines or fewer; split along real boundaries.
- The core never returns display text. It returns `key + params`, `value + unit` or an `ErrorCode`; the UI translates.
- Secrets use a secret type (e.g. `SecretString`) whose `Debug` does not print the value.
- Logging with `tracing`; redaction happens in the logging layer.
- Traits only at I/O boundaries that have at least two real implementations (`Transport`, `UrlProbe`, `AiClient`). No `Clock` trait (pass `now`), no secret store in core (pass keys in).
- Gates: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`, `cargo test --workspace --all-features`.

## TypeScript / Vue

- Only `src/api/` imports `@tauri-apps/*` (enforced by ESLint).
- `v-html` is forbidden (`vue/no-v-html: error`), and so are `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `createContextualFragment` and `document.write` (ESLint, plus a test over the sources); server and AI output are always text.
- Primitives in `src/ui/` use tokens only (no colour literal in their styles; a test checks), take their text from the caller, and come with a component test (render, interaction, ARIA) and a place in the dev gallery.
- Colours, sizes, radii, shadows, easing and durations come from `src/styles/tokens.css` (`var(--…)`), never literals in a component; user-visible text comes from `src/i18n` and numbers, units and times from `src/lib/format.ts`.
- Motion uses the utilities in `src/styles/motion.css` and `src/lib/motion.ts`; only transform and opacity move, and every kind has a reduced-motion fallback.
- Generated bindings in `src/api/bindings/` are never edited by hand. Regenerate with `scripts/check-bindings.sh`.
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`.

## Shell (check scripts)

- POSIX `sh`, read-only, no `sudo`, must pass `shellcheck`.
- A check script is a function body in `crates/core/checks/`, named after its id (`sys.load` → `sys_load.sh`), run in a subshell after `prelude.sh`. It runs only builtins, prelude helpers and the commands in its manifest `needs` (allowlist test), and prints facts with `emit`. The full recipe is in `CONTRIBUTING.md` › Adding a check.

- The setup scripts (`crates/core/discover/login.sh` and `discover.sh`) follow the same rules, with their own `needs` (`LOGIN_NEEDS`, `DISCOVER_NEEDS` in `discover/mod.rs`), and a stricter one: they never open a `.env`, only list it and test it with `-r`. They print records (`"rec"`), not facts.

## Naming

- Rust files: `snake_case.rs`.
- TypeScript files: `kebab-case.ts`.
- Vue single-file components: `PascalCase.vue`, at least two words (`Ui…` for primitives in `src/ui/`, `App…` for the window frame in `src/layout/`).
- Shell scripts: `kebab-case.sh`; check scripts follow their check id (`disk_fs.sh`).

## Commits

- [Conventional Commits](https://www.conventionalcommits.org), e.g. `feat(scan): stream host results`.
- Do not commit secrets, `.env` files, real hostnames or IP addresses.
