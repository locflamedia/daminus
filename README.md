<p align="center">
  <img src="assets/brand/readme-hero@2x.png" alt="Daminus: check every VPS in one scan. Agentless, over SSH, from your Mac." width="720">
</p>

# Daminus

I run a handful of VPSes for a few web projects. I don't need a dashboard open all day. I need to know, a few times a week, whether something is about to break: disk filling up, a container restarting, a certificate close to expiring, a PHP file where only images should be.

Daminus is a Mac app for that. You open it, press Scan, read the result per project, and close it. It connects with your own `ssh`, installs nothing on the servers, and only reads.

![Overview](assets/screenshots/overview-light.png)

![Security tab, dark](assets/screenshots/security-dark.png)

The screenshots use the app's built-in sample data.

Status: release candidates for v0.1.0 are published as pre-releases on the [Releases](https://github.com/locflamedia/daminus/releases) page. It has had little testing on real servers so far, so expect rough edges.

## What it does

- Reads your `~/.ssh/config` (ProxyJump, 1Password and Secretive agents, `known_hosts` all work as they do in your terminal), finds compose projects, pm2 apps, nginx sites and databases on each host, and groups them into projects.
- Runs 21 checks over one SSH call per host: load, memory, swap and OOM kills; disks, big folders and logs, Docker usage; compose containers, pm2 apps, MySQL/MariaDB and PostgreSQL size; HTTP status, latency and TLS expiry; an exposed `.env` or `.git`; and a few security signs (miner processes, PHP in upload folders, executables in `/tmp`, `ld.so.preload`, public ports, recently changed files).
- Shows one card per project, with what changed since the previous scan and a forecast for disks that are filling. A host that does not answer is shown as unreachable, never as fine.
- Keeps past scans. You can mark a finding as expected once you have decided it is fine.
- Lives in the menu bar after you close the window, showing the last result.
- Optionally asks an AI to review the findings. You bring the key (Anthropic, OpenAI, Gemini, DeepSeek, OpenRouter, a local Ollama, or any OpenAI-compatible endpoint), you can read the redacted payload before it is sent, and it only answers in text: it never runs commands. There is also a beta provider that drives your own signed-in Claude Code.
- English and Vietnamese, light and dark, ⌘K to search, ⌘R to scan, `?` for the shortcuts.

It does not run in the background and it does not send notifications. It scans when you press the button.

## How it works

```
~/.ssh/config ─► Daminus ──ssh <host> 'sh -s' < bundle──► server (POSIX sh, read-only checks)
                    │                                        │
                    │◄──────────── JSON lines ───────────────┘
                    ▼
             project cards + diff vs. last scan ──► (optional) AI summary
```

Each check is a small POSIX shell script that prints facts as JSON. The Rust side decides how serious a fact is, using thresholds from a manifest, so changing a threshold takes effect without scanning again. A test in CI runs the scripts in read-only containers and fails on any write.

Your config is a `projects.json` that refers to SSH host aliases and holds no secrets. Database credentials are read from the `.env` file on the server and never leave it. AI keys go in the macOS Keychain, and secrets are redacted before anything is sent.

## Install

Needs macOS 13 or later. Download the `.dmg` for your Mac (Apple Silicon or Intel) from [Releases](https://github.com/locflamedia/daminus/releases) and drag Daminus to Applications.

To check the download, run this in the folder with the files:

```sh
shasum -a 256 -c SHA256SUMS --ignore-missing
gh attestation verify Daminus_<version>_<arch>.dmg --repo locflamedia/daminus
```

The second command checks the build attestation that CI publishes for each `.dmg`.

### The first launch is blocked

The builds are signed ad hoc, not notarized by Apple, so Gatekeeper stops the first launch. On macOS 15 and later:

1. Try to open Daminus once and dismiss the warning.
2. Open System Settings › Privacy & Security, scroll to Security, and click Open Anyway next to Daminus. The button stays for about an hour.

Or remove the quarantine flag: `xattr -d com.apple.quarantine /Applications/Daminus.app`. On macOS 15, right-click › Open no longer works for this (see Apple's [note](https://developer.apple.com/news/?id=saqachfa)).

Because of the ad hoc signature, every new version looks like a new app to macOS. After an update it asks again before Daminus can read the AI key from your Keychain. Choose Always Allow, or enter the key again in Settings › AI.

## Limits

- A server that an attacker controls can answer anything, because every check runs on the server. "No problems found" is a hint, not proof.
- Alpine and busybox servers are not supported yet. Checks that need GNU or full POSIX tools report as unsupported.
- Only macOS is released. Linux and Windows builds run in CI as a best effort.

## Building and contributing

Rust, Vue 3 and TypeScript on [Tauri 2](https://tauri.app). Setup, the checks CI runs, and how to add a check (a shell script, a manifest entry, two strings and a golden output file, no Rust) are in [CONTRIBUTING.md](CONTRIBUTING.md). Design notes and decisions are in [docs/](docs/). Questions go to [Discussions](https://github.com/locflamedia/daminus/discussions). To report a vulnerability, follow [SECURITY.md](SECURITY.md) and don't open a public issue.

The Starry Night by Vincent van Gogh (public domain) appears in the icon and the intro; other credits are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

MIT licensed, see [LICENSE](LICENSE).
