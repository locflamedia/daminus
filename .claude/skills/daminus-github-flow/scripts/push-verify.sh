#!/usr/bin/env bash
# Push a branch with an explicit name and prove the remote moved.
# A bare `git push` on a branch without upstream can print "ok" and leave the
# remote where it was; comparing the two SHAs afterwards catches that.
# Usage: push-verify.sh [branch]   (default: the current branch; never main)
set -euo pipefail

branch=${1:-$(git rev-parse --abbrev-ref HEAD)}
case $branch in
main | HEAD)
	echo "refusing to push '$branch': use a feature branch and a PR" >&2
	exit 2
	;;
esac

git push origin "$branch"
git fetch -q origin "$branch"
local_sha=$(git rev-parse "$branch")
remote_sha=$(git rev-parse "origin/$branch")
if [ "$local_sha" != "$remote_sha" ]; then
	echo "push did not land: local $local_sha, remote $remote_sha" >&2
	exit 1
fi
echo "pushed $branch at ${local_sha%"${local_sha#???????}"}"
