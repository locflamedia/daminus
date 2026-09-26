<h1 align="center">Daminus</h1>

<p align="center">
  <a href="https://github.com/locflamedia/daminus/stargazers"><img src="https://img.shields.io/github/stars/locflamedia/daminus?style=flat&logo=github" alt="GitHub stars"></a>
  <a href="https://github.com/locflamedia/daminus/releases/latest"><img src="https://img.shields.io/github/v/release/locflamedia/daminus?include_prereleases&label=Release" alt="Latest release"></a>
  <a href="https://github.com/locflamedia/daminus/releases"><img src="https://img.shields.io/github/downloads/locflamedia/daminus/total?label=Downloads" alt="Downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Platform-macOS-000000?logo=apple&logoColor=white" alt="Platform: macOS">
  <img src="https://img.shields.io/badge/Built%20with-Tauri%202-24C8DB?logo=tauri&logoColor=white" alt="Built with Tauri 2">
</p>

<p align="center">
  <strong>Open the app, scan your servers, see what's wrong with each project, close the app.</strong><br>
  Agentless. Read-only. Nothing to install on your servers.
</p>

---

Daminus is a desktop app (macOS first) that checks the servers behind your web projects over plain SSH. It installs nothing on your servers, runs read-only checks, and groups the results by *project* (frontend, backend, database, worker) instead of by machine.

> [!WARNING]
> **Status: pre-alpha.** The design is being finalized and there is no usable build yet. Watch or star the repo to follow progress.

## Why

Most monitoring tools want an agent on every server and a dashboard running 24/7. If you run a handful of VPSes for a few projects, you usually just want to answer "is anything about to break?" a few times a week. Daminus is built for that:

- **Agentless.** Uses your system `ssh` and `~/.ssh/config` (ProxyJump, 1Password/Secretive agents, known_hosts all just work).
- **Read-only.** Checks never write to or delete anything on the server. CI enforces this.
- **Project-centric.** One card per project: URL health, SSL expiry, disk usage, containers/pm2 status, database size, security signals.
- **On demand.** No daemon, no background polling. Each scan is a single SSH call per host.
- **Optional AI analysis.** Bring your own key for Anthropic, OpenAI, Ollama (local), OpenRouter, or any OpenAI-compatible endpoint.

## How it works

```
~/.ssh/config ─► Daminus ──ssh <host> 'sh -s' < bundle──► server (POSIX sh, read-only checks)
                    │                                        │
                    │◄──────────── JSON lines ───────────────┘
                    ▼
             project cards + diff vs. last scan ──► (optional) AI summary
```

- Checks live in `crates/core/checks/`. Each one is a small POSIX shell script that prints JSON. Adding a check means adding a shell file, no Rust required.
- Config is a hand-editable `projects.json` that references SSH host aliases. It holds **no secrets**.
- Database credentials are read from the `.env` file **on the server** and never leave it.
- AI API keys are stored in the OS keychain and redaction runs before anything is sent.

## Planned features (v0.1)

- [ ] Setup: pick hosts from `~/.ssh/config`, auto-discover compose projects, pm2 apps, nginx vhosts, and databases
- [ ] Parallel scan with results streaming in per host
- [ ] Project cards sorted by severity, with deltas since the last scan
- [ ] URL checks: HTTP status, latency, TLS expiry, exposed `.env` / `.git`
- [ ] AI analysis panel (structured output, never runs commands)
- [ ] macOS `.dmg` release (Linux/Windows best effort)

## Install

Not available yet. The first release will be published on the [Releases](https://github.com/locflamedia/daminus/releases) page.

> Builds are not notarized by Apple. On first launch, right-click the app and choose **Open**, or run `xattr -d com.apple.quarantine /Applications/Daminus.app`.

## Tech stack

[Tauri 2](https://tauri.app) · Vue 3 + TypeScript · Rust · [`genai`](https://github.com/jeremychone/rust-genai) for multi-provider AI

## Contributing

Contributions are welcome, especially new checks. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. For questions and ideas, use [Discussions](https://github.com/locflamedia/daminus/discussions).

To report a vulnerability, follow [SECURITY.md](SECURITY.md). Please don't open a public issue.

<a href="https://github.com/locflamedia/daminus/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=locflamedia/daminus" alt="Contributors">
</a>

## ⭐ Star History

If Daminus is useful to you, a star helps other people find it.

[![Star History Chart](https://api.star-history.com/svg?repos=locflamedia/daminus&type=Date)](https://star-history.com/#locflamedia/daminus&Date)

## License

[MIT](LICENSE)
