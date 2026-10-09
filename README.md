<p align="center">
  <img src="assets/brand/readme-hero@2x.png" alt="Daminus: check every VPS in one scan. Agentless, over SSH, from your Mac." width="720">
</p>

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

> [!NOTE]
> **Status: release candidates.** Daminus is approaching v0.1.0. Builds are published as pre-releases (`v0.1.0-rc.N`) on the [Releases](https://github.com/locflamedia/daminus/releases) page. Expect rough edges and report them.

## Why

Most monitoring tools want an agent on every server and a dashboard running 24/7. If you run a handful of VPSes for a few projects, you usually just want to answer "is anything about to break?" a few times a week. Daminus is built for that:

- **Agentless.** Uses your system `ssh` and `~/.ssh/config` (ProxyJump, 1Password/Secretive agents, known_hosts all just work).
- **Read-only.** Checks never write to or delete anything on the server. CI enforces this.
- **Project-centric.** One card per project: URL health, SSL expiry, disk usage, containers/pm2 status, database size, security signals.
- **On demand.** No daemon, no background polling. Each scan is a single SSH call per host.
- **Optional AI analysis.** Bring your own key for Anthropic, OpenAI, Gemini, DeepSeek, OpenRouter, Ollama (local) or any OpenAI-compatible endpoint. Off until you set it up.

## Screenshots

<p align="center">
  <img src="assets/screenshots/overview-light.png" alt="Overview: three projects with their servers, issues and changes since the last scan" width="860">
</p>

<p align="center">
  <img src="assets/screenshots/security-dark.png" alt="Project security tab in dark mode: what to fix first, the evidence, and the checks of this scan" width="860">
</p>

<sub>Demo data from the app's built-in sample report. Light and dark themes follow your system; English and Vietnamese are built in.</sub>

## How it works

```
~/.ssh/config ─► Daminus ──ssh <host> 'sh -s' < bundle──► server (POSIX sh, read-only checks)
                    │                                        │
                    │◄──────────── JSON lines ───────────────┘
                    ▼
             project cards + diff vs. last scan ──► (optional) AI summary
```

- Checks live in `crates/core/checks/`. Each one is a small POSIX shell script that prints JSON facts; Rust decides the severity from thresholds in a manifest. Adding a check is a shell script, a manifest entry, two strings and a golden output file, with no Rust code (see [CONTRIBUTING.md](CONTRIBUTING.md)).
- Config is a hand-editable `projects.json` that references SSH host aliases. It holds **no secrets**.
- Database credentials are read from the `.env` file **on the server** and never leave it.
- AI API keys are stored in the OS keychain and redaction runs before anything is sent.

## v0.1 features

- [x] **Setup.** Pick hosts from `~/.ssh/config` (or Termius), auto-discover compose projects, pm2 apps, nginx vhosts and databases, group them into projects
- [x] **21 read-only checks:**
  - system: load, memory, swap, pressure, OOM kills;
  - disk: filesystems, big folders, big logs, Docker usage;
  - services: compose containers, pm2 apps, database size (MySQL/MariaDB, PostgreSQL);
  - security signals: miner processes, PHP in upload folders, executables in `/tmp`, `ld.so.preload`, public ports, recently changed files;
  - URLs: HTTP status and latency, TLS expiry, exposed `.env` / `.git`
- [x] **Parallel scan** with results streaming in per host; a host that does not answer is shown as unreachable, never as healthy
- [x] **Project cards** sorted by severity, with changes since the previous scan and a disk-fill forecast
- [x] **History.** Scans are kept, results compare with an earlier scan, and "Mark as expected" for findings you accept
- [x] **Menu bar** icon with the latest result, Scan now and quick-open of the project that needs a look
- [x] **AI review and Ask** (optional): structured findings and follow-up questions on a redacted payload you can read first; it never runs commands. Includes a beta provider that uses your own signed-in Claude Code
- [x] **Keyboard first:** ⌘K search, ⌘R scan, `?` for every shortcut
- [x] English and Vietnamese, light and dark, Reduce motion respected
- [ ] macOS `.dmg` release (published with the first tag; Linux/Windows best effort)

## Install

Requires macOS 13 or later. Download the `.dmg` for your Mac from [Releases](https://github.com/locflamedia/daminus/releases): the Apple Silicon build or the Intel (x64) build. Drag Daminus to Applications.

To verify the download, in the folder that holds the files:

```sh
shasum -a 256 -c SHA256SUMS --ignore-missing
gh attestation verify Daminus_<version>_<arch>.dmg --repo locflamedia/daminus
```

The second command checks the build provenance attestation that CI publishes for each `.dmg`.

### Opening an app that is not notarized

Builds are signed ad hoc and are not notarized by Apple, so Gatekeeper blocks the first launch. On macOS 15 (Sequoia) and later:

1. Try to open Daminus once. Dismiss the warning.
2. Open **System Settings › Privacy & Security**, scroll to **Security**, and click **Open Anyway** next to Daminus. The button stays available for about an hour after the attempt.

Or remove the quarantine flag in a terminal: `xattr -d com.apple.quarantine /Applications/Daminus.app`.

On macOS 15, right-click › Open no longer bypasses Gatekeeper for unsigned or un-notarized apps (see Apple's [notes on runtime protection](https://developer.apple.com/news/?id=saqachfa)); older macOS versions still accepted it.

Builds are signed ad hoc, so every new version is a new identity to macOS: after an update, macOS asks again before Daminus can read the AI key it stored in your Keychain. Choose **Always Allow**; if you deny it, re-enter the key in Settings › AI.

## Limits

- **A compromised server can lie.** Every check runs on the server, so a server an attacker controls can answer anything. "No problems found" is a hint, not proof.
- **Alpine and busybox servers are not supported in v0.1.** Checks that need GNU or full POSIX tools report as unsupported there.
- **Linux and Windows are best effort.** They are not released; only macOS builds are.

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
