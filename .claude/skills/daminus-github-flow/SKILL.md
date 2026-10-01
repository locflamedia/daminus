---
name: daminus-github-flow
description: Daminus repo's GitHub routine - commit, push, draft PR, watch CI, fix red CI, mark ready and merge. Use whenever the user or a subagent in the Daminus repo says push, open a PR, wait for CI, CI is red, merge, ship this phase, or asks whether a branch is up to date on GitHub, even if they do not name the steps.
---

# Daminus GitHub flow

The same GitHub steps come up after every phase. This is the order and the repo-specific facts that were learned the hard way.

## Authority

Push, open PRs, and merge a PR with green CI are pre-approved for this repo. **Creating a release (tag, GitHub release, DMG upload) is not**: ask first. Never commit `plans/` (gitignored, private) or secrets (`.env`, keys, tokens).

## Commit

- Conventional commits (`feat(checks): ...`, `fix(probe): ...`, `docs: ...`, `test: ...`). The PR title is checked by CI with the same rule, so it must be conventional too.
- No AI mention. No plan IDs, phase numbers or audit labels in commit messages, code comments or test names: say what the behaviour is.
- Stage by path, not `git add -A`, so stray generated files do not slip in.

## Scripts

The scripts live in `.claude/skills/daminus-github-flow/scripts/` (paths below are relative to that folder). Run them from the repo root; they only use `git`, `gh` and `jq`.

| Script | Does |
|---|---|
| `scripts/push-verify.sh [branch]` | `git push origin <branch>` then proves the remote SHA equals the local one. Refuses `main`. |
| `scripts/ci-wait.sh <pr>` | Waits until CI has a run for the PR's head SHA, then blocks until all jobs end. Exit 0 = all green. `CI_WAIT=0` gives one snapshot. |
| `scripts/merge-ready.sh <pr> [--dry-run]` | Checks the PR is open, conflict-free, head = remote branch, CI green; then marks ready and squash-merges. Never deletes the branch. |

## Push

The feature branch may have no upstream, and a bare `git push` can print "ok" while the remote does not move (this happened). Use `scripts/push-verify.sh`, not `git push`.

## Open the PR early, as a draft

CI runs on every push, so open the draft PR right after the first commit (a branch with no diff cannot have a PR, so make the first commit real):

```bash
gh pr create --draft --base main --title "<conventional title>" --body "<what and why>"
```

## Watch CI

`scripts/ci-wait.sh <pr>` (blocks until done). For a quick look: `CI_WAIT=0 scripts/ci-wait.sh <pr>`.

Jobs: `core` (fmt, clippy, test, bindings, boundaries), `shell` (shellcheck, allowlist, read-only harness; the slowest, 5-8 min), `web`, `supply chain` (cargo deny), `app e2e`, `conventional-commit`. The macOS `app` smoke job shows "skipping" unless the PR has the `app` label or it is a release; that is by design, not a failure.

The script already waits for a run on the pushed SHA: `gh pr checks` right after a push can still show the previous run.

## When CI is red

1. `gh run view <run-id> --log-failed` and read the actual error.
2. Reproduce locally with the same command CI uses (see `.github/workflows/ci.yml`); Linux-only failures (hangup, `stat`, `df`, leftover processes) usually reproduce in the Docker harness, `scripts/check-harness/run.sh`.
3. Fix the root cause. Do not weaken a test, skip a job or retry until it passes.
4. Push, watch again. Repeat until all Linux jobs are green.

## Merge

Only when the work was reviewed. `scripts/merge-ready.sh <pr> --dry-run` first, then without the flag: it refuses unless CI is green, marks a draft ready, and squash-merges (the repo's convention: PR #1 landed as one squash commit). Then `git checkout main && git pull --ff-only`.

Do not use `--delete-branch` unless asked; branch deletion is not set up on this repo. After merging, update the status column in the plan (`plans/.../plan.md`, local only).

## Report

When you finish, give: PR link, the commits (hash + subject), CI state per job, and anything that still needs the user (manual acceptance items, open design requests).
