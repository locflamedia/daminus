#!/usr/bin/env bash
# Merge a PR the way this repo does (squash), but only when CI is green.
# Marks a draft PR ready first. --dry-run only reports what it would do.
# Does not delete the branch. Usage: merge-ready.sh <pr-number> [--dry-run]
set -euo pipefail

pr=${1:?usage: merge-ready.sh <pr-number> [--dry-run]}
dry=${2-}

info=$(gh pr view "$pr" --json state,isDraft,headRefName,headRefOid,title,mergeable)
state=$(jq -r .state <<<"$info")
draft=$(jq -r .isDraft <<<"$info")
branch=$(jq -r .headRefName <<<"$info")
title=$(jq -r .title <<<"$info")
mergeable=$(jq -r .mergeable <<<"$info")

if [ "$state" != OPEN ]; then
	echo "PR $pr is $state" >&2
	exit 1
fi
if [ "$mergeable" = CONFLICTING ]; then
	echo "PR $pr has merge conflicts with main" >&2
	exit 1
fi

# The PR must show the commit that is on the remote branch, and CI must be done and green.
remote_sha=$(git ls-remote origin "refs/heads/$branch" | cut -f1)
if [ "$remote_sha" != "$(jq -r .headRefOid <<<"$info")" ]; then
	echo "PR head differs from origin/$branch: wait a moment and retry" >&2
	exit 1
fi
if ! gh pr checks "$pr"; then
	echo "CI is not green (failed or still running): not merging" >&2
	exit 1
fi

if [ "$dry" = --dry-run ]; then
	echo "dry run: would mark ready (draft=$draft) and squash-merge \"$title\""
	exit 0
fi

if [ "$draft" = true ]; then
	gh pr ready "$pr"
fi
gh pr merge "$pr" --squash
git fetch -q origin main
echo "merged PR $pr; update local main with: git checkout main && git pull --ff-only"
