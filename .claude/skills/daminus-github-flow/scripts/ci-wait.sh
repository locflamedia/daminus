#!/usr/bin/env bash
# Wait for the CI run of a PR's current head commit, then print every job.
# Exit 0 when all jobs passed (skipped counts as passed), 1 when one failed.
# Right after a push `gh pr checks` still shows the previous run, so this waits
# until a run exists for the head SHA first.
# Usage: ci-wait.sh <pr-number>      CI_WAIT=0 ci-wait.sh <pr>  (one snapshot, no waiting)
set -euo pipefail

pr=${1:?usage: ci-wait.sh <pr-number>}
sha=$(gh pr view "$pr" --json headRefOid --jq .headRefOid)

if [ "${CI_WAIT:-1}" = 0 ]; then
	gh pr checks "$pr" || true
	exit 0
fi

# Up to 3 minutes for the workflow runs of this commit to appear.
n=0
until [ "$(gh run list --commit "$sha" --json databaseId --jq length)" -gt 0 ]; do
	n=$((n + 1))
	if [ "$n" -gt 18 ]; then
		echo "no CI run for ${sha%"${sha#???????}"} after 3 minutes (is the PR title or branch blocking it?)" >&2
		exit 1
	fi
	sleep 10
done

# Blocks until every check finishes; exits non-zero when one failed.
if gh pr checks "$pr" --watch --interval 30; then
	exit 0
fi
echo "CI failed for ${sha%"${sha#???????}"}: gh run list --commit $sha, then gh run view <id> --log-failed" >&2
exit 1
