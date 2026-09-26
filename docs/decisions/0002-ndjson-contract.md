# 0002 · Check scripts talk to the app over versioned NDJSON

Status: accepted · 2026-09-26

## Context

Checks run as POSIX shell on servers we do not control and that may be compromised. The app needs structured facts, progress, and a reliable way to tell a finished run from a truncated one.

## Decision

A bundle writes one JSON object per line to stdout:

- `begin {v, bundle}` opens the run and states the contract version.
- `step {group, ms}` marks each check group as it finishes.
- fact lines carry `check`, a target, raw values with units, and an optional `fp` (fingerprint).
- `end` closes the run.

A run without `end` is **Partial**, whatever the exit code. Scripts report numbers and facts only; Rust decides severity from the manifest thresholds. Lines are size-limited and control characters are filtered before parsing. Server stderr is not sent back to the Mac.

## Consequences

- Shell tests and Rust tests share one set of NDJSON fixtures.
- Adding a check does not change the parser: new facts are new lines.
- Unknown fields are ignored, so newer scripts can talk to older apps within the same `v`.
