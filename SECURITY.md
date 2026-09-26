# Security Policy

Daminus connects to your servers over SSH and can handle AI API keys, so we take security reports seriously.

## Supported versions

Until 1.0, only the latest release receives security fixes.

## Reporting a vulnerability

**Please do not open a public issue.**

Report it privately through [GitHub Security Advisories](https://github.com/locflamedia/daminus/security/advisories/new). Include:

- what the issue is and its impact
- steps to reproduce, or a proof of concept
- the affected version or commit

You should get a response within 7 days. We'll keep you updated on the fix and credit you in the release notes unless you prefer otherwise.

## Scope

Especially relevant:

- A check script that can modify server state (checks must be read-only)
- Command injection through `projects.json` values or the scan bundle
- Secrets (database passwords, API keys) leaking into snapshots, logs, or AI requests
- API keys reaching the webview instead of staying in the Rust backend or OS keychain
