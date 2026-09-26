# 0003 · On demand only: no background scans

Status: accepted · 2026-09-26

## Context

Monitoring tools usually run agents or schedulers. Daminus targets people who want a quick, trustworthy look at a handful of servers without installing anything on them or keeping a daemon alive on their Mac.

## Decision

Scans run only when the user asks (Scan button, ⌘R, or the menu bar). Opening the app does not scan by default ("scan on open" is an opt-in setting). When the window is closed the app stays in the menu bar showing the last results, but it never scans in the background and never sends notifications. A scan stopped midway is discarded; the previous results stay on screen.

## Consequences

- No agent, cron job or listening port on servers; nothing to secure or upgrade there.
- Results can be stale. The UI always shows when the last scan ran and marks old findings as not rechecked since scan #n.
- Trends come from the snapshots the user chose to take, not from a continuous time series.
