# System architecture

Daminus is an on-demand health check for small fleets of servers: you open the app, press Scan, read the results, and close it. Nothing runs in the background and nothing is installed on the servers.

## Shape

One core crate plus a thin Tauri shell and a Vue front end (a modular monolith).

```
┌──────────────────────── macOS app ────────────────────────┐
│  src (Vue 3 + TS)                                          │
│    api/        the only code that imports @tauri-apps/*    │
│    stores/ features/* ui/ layout/ i18n tokens              │
│                     ▲  typed IPC (commands + one event     │
│                     │  per domain, e.g. scan://event)      │
│  src-tauri (thin shell)                                    │
│    commands · events · scan run state · keychain · tray    │
│    GUI env · logging · capabilities / CSP                  │
│                     ▲  plain Rust calls                    │
│  crates/core (daminus_core, no Tauri)                      │
│    domain (pure) · contracts · checks (scripts, manifest)  │
│    ssh transport · url probe · scan service + evaluate     │
│    discover · ai · store (FsStore) · redact                │
│    bin/daminus-dev (feature `cli`)                         │
└─────────────┬──────────────────────────────┬──────────────┘
              │ system `ssh` (user's config,  │ HTTPS from the Mac
              │ agent, ProxyJump)             │
              ▼                               ▼
     servers: one read-only           project URLs (status,
     bundle per host, NDJSON out      latency, TLS, domain)
```

### Boundaries

- **`crates/core`** is pure Rust and knows nothing about Tauri. `domain/` must not import `ssh`, `probe`, `ai` or `store`, including aliased and grouped imports (`scripts/check-core-boundaries.sh` in CI, with a fixture test).
- **`src-tauri`** wires core into commands, events, the tray and the keychain. It holds no business rules.
- **`src/api/`** is the only front-end code allowed to import `@tauri-apps/*` (ESLint bans static and dynamic imports and the `__TAURI__` / `__TAURI_INTERNALS__` globals elsewhere). Everything else goes through its typed wrappers.
- **Bindings:** Rust types are exported to TypeScript with `ts-rs` into `src/api/bindings/`, committed, and checked for drift in CI.

### Scan flow

`scan_start` (single flight) → `ScanService` → in parallel { `Transport.run(bundle)` per host, `UrlProbe` } → NDJSON lines (size-limited, control characters filtered) → `CheckFact` → event `scan://event` (with `scan_id`, `seq`) → on completion, save a raw snapshot (discarded if the scan was cancelled) → UI and tray call `evaluate`.

Snapshots store raw facts only. Delta, expected, stale, rollup and severity are computed at read time by one pure function, `evaluate(history, config, manifest, now)`, shared by the CLI, commands, menu bar and AI payload. Severity thresholds live in the check manifest (plus user settings), so changing a threshold takes effect without rescanning.

## Threat model

**Assets to protect**

- Database credentials and other secrets that live in `.env` files, pm2 env and compose files on the servers.
- AI provider API keys stored in the macOS keychain.
- The user's SSH agent and keys: Daminus borrows their access and must never widen it.

**Adversaries and untrusted inputs**

- **A server may be compromised and lie.** Script output is data, never code: lines are parsed as NDJSON with size limits and character filtering, unknown fields are ignored, and nothing from a server is rendered as HTML (`vue/no-v-html` is an error) or executed on the Mac.
- **Config files may be hand-edited wrongly.** `projects.json`, settings and snapshots are parsed leniently where safe and rejected with a typed error where not; a bad file never crashes the app or silently widens what runs remotely.
- **AI output is untrusted.** It is shown as text, never executed. Suggested commands are copy-only.

**Controls**

- **Read-only on servers.** Check scripts only read. They never write, restart, install or call `sudo`. This is enforced by a command allowlist and by running the bundle in a `--read-only` container as a normal user in CI, comparing hashes before and after.
- **Secrets never leave the server.** Scripts read `.env` locally to reach the database and emit only numbers and facts. A canary secret seeded in `.env`, pm2 env and compose must never appear in stdout, stderr, snapshots, events, logs or AI payloads (end-to-end test). Server stderr is not sent back to the Mac.
- **API keys never reach the webview.** Keys stay in the keychain and in Rust; the front end only sees whether a key is set.
- **Webview hardening.** Strict CSP, no remote content, capabilities limited to the app's own commands.
- **Logs are redacted** at the logging layer; secret types do not implement a revealing `Debug`.

## Decision Log

| Decision | Chosen | Rejected |
|---|---|---|
| Shape | One core crate + Tauri shell (modular monolith) | Many hexagonal crates |
| `projects.json` v1 | Components carry an explicit `kind`; `rules` at top level with `host`; `hosts` for server-level settings | serde untagged; rules nested inside projects |
| NDJSON v1 | Meta lines `begin{v,bundle}` / `step{group,ms}` / `end`; optional `fp`; missing `end` = Partial | Completion judged by exit code |
| Snapshot v1 | Raw facts + coverage only; file name `000123.json` by `seq`; lenient reads, no history migration | Storing delta/rollup; names by time |
| Severity | Computed in Rust from manifest thresholds ⊕ settings | Scripts decide severity |
| IPC | `AppError{code, params, retryable}`; one event per domain (`scan://event`, tagged); bindings committed | English error strings; many channel names |
| Cancelled scan | Not saved | Save partial |
| Rust → TS bindings | `ts-rs` 12 behind core feature `ts`, exported to `src/api/bindings/`, committed and drift-checked in CI; command wrappers written by hand in `src/api/` with a test that compares command names against the Rust handler list | `tauri-specta` (still `2.0.0-rc.25` at decision time; an RC in the IPC path is a risk we do not need) |
| Toolchain | Rust edition 2024, MSRV 1.88 (needed by patched `time`); Tauri 2.11; Vue 3.5 + Vite 8 + TypeScript 6.0 (typescript-eslint does not support TS 7 yet); pnpm 10 with committed lockfile | TypeScript 7 native compiler |
| App identity | Bundle id `dev.daminus.app`, macOS 13+, window min 900 × 640 | – |
| App icons | Built from the hand-made sizes in `assets/brand/` by `scripts/build-app-icons.sh` (small sizes drop the painting) | `tauri icon` downscaling the 1024 px master |
| App version | One source: `[workspace.package] version` in `Cargo.toml`; `tauri.conf.json` and `package.json` carry none, so Tauri reads it from `src-tauri/Cargo.toml` | Hand-synced copies in three files |
| CI | Main CI on pushes to `main` and on PRs; the macOS `tauri build` smoke is its own workflow (`app-smoke.yml`) for releases and PRs labelled `app`, so other labels never restart or cancel CI | `labeled` trigger on the main CI |
| Supply chain | `cargo deny` (advisories, licenses, bans, sources); GitHub Actions pinned by SHA with minimal `permissions` | Unpinned tags |

Architecture decision records with more context live in [`docs/decisions/`](decisions/).
