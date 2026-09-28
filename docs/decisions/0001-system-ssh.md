# 0001 · Use the system `ssh` binary, not a Rust SSH library

Status: accepted · 2026-09-26

## Context

Daminus users already reach their servers with `ssh`. Their setup lives in `~/.ssh/config` (aliases, `ProxyJump`, `IdentityFile`, `Include`, `Match`), in `ssh-agent` or a hardware key, and in `known_hosts`. Rust SSH libraries implement only part of that config language and none of the agent, FIDO or `ProxyCommand` integrations people rely on.

## Decision

The transport spawns the system `ssh` with `BatchMode=yes` and sends one read-only script bundle per host over stdin. Host key checking stays on and uses the user's `known_hosts`.

## Consequences

- Anything that works in the user's terminal works in Daminus, including jump hosts and agents.
- The app must reconstruct the login-shell environment when launched from Finder (`SSH_AUTH_SOCK`, `PATH`), which is tested from a Finder launch.
- We parse `ssh` exit codes and stderr on the Mac to classify failures (auth, host key changed, unreachable) instead of getting typed errors from a library.
- The transport sits behind a `Transport` trait so tests can use a fake or a container.
