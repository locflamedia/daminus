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
- `v-html` is forbidden (`vue/no-v-html: error`); server and AI output are always text.
- Generated bindings in `src/api/bindings/` are never edited by hand. Regenerate with `scripts/check-bindings.sh`.
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`.

## Shell (check scripts)

- POSIX `sh`, read-only, no `sudo`, must pass `shellcheck`.

## Naming

- Rust files: `snake_case.rs`.
- TypeScript files: `kebab-case.ts`.
- Vue single-file components: `PascalCase.vue`.
- Shell scripts: `kebab-case.sh`.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org), e.g. `feat(scan): stream host results`.
- Do not commit secrets, `.env` files, real hostnames or IP addresses.
