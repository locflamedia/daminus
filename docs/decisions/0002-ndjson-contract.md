# 0002 · Check scripts talk to the app over versioned NDJSON

Status: accepted · 2026-09-26

## Context

Checks run as POSIX shell on servers we do not control and that may be compromised. The app needs structured facts, progress, and a reliable way to tell a finished run from a truncated one.

## Decision

A bundle writes one JSON object per line to stdout:

- Meta lines carry a `"_"` key: `{"_":"begin","v":1,"bundle":"<hash>"}` opens the run and states the contract version; `{"_":"step","group":"disk","ms":80}` marks a check group as **finished** (it is what coverage is built from); `{"_":"end"}` closes the run.
- Fact lines have no `"_"` key and carry `check`, `target`, raw `value` with `unit`, a `data` object, an optional `fp` (fingerprint) and, when the check could not answer, `unknown` (`needs_perm`, `missing`, `unsupported`, `timeout`). An unknown fact may also carry `data` saying how far the check got (`sec.miner` with `{seen, total}`: processes it could inspect out of all).
- Lines before `begin` or after `end`, a `begin` with another `v`, and anything that is not one of these shapes are dropped and counted.
- Server output is untrusted, so a scan parses it against the bundle it sent: a `begin` whose hash is not that bundle's is dropped (nothing after it is accepted, so the run is Partial), and facts for checks the bundle did not contain (local checks such as `url.tls` included) and `step` lines for groups it did not run are dropped and counted.

A run without `end` is **Partial**, whatever the exit code. Scripts report numbers and facts only; Rust decides severity from the manifest thresholds. Lines are size-limited and control characters are filtered before parsing. Server stderr is not sent back to the Mac.

## Consequences

- Shell tests and Rust tests share one set of NDJSON fixtures.
- Adding a check does not change the parser: new facts are new lines.
- Unknown fields are ignored, so newer scripts can talk to older apps within the same `v`.
