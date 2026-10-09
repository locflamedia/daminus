#!/bin/sh
# Write SHA256SUMS for every *.dmg in <dir> (bare file names, sorted) and
# verify it afterwards.
#
# Usage: checksums.sh <dir>
set -eu

if [ "$#" -ne 1 ] || [ ! -d "$1" ]; then
    echo "usage: $0 <dir>" >&2
    exit 2
fi

if command -v sha256sum >/dev/null 2>&1; then
    sum() { sha256sum "$@"; }
else
    sum() { shasum -a 256 "$@"; }
fi

cd "$1"
files=$(find . -maxdepth 1 -type f -name '*.dmg' | sed 's|^\./||' | LC_ALL=C sort)
if [ -z "$files" ]; then
    echo "error: no .dmg files in $1" >&2
    exit 1
fi

rm -f SHA256SUMS
tmp=SHA256SUMS.tmp
: > "$tmp"
# File names with newlines are not supported; DMG names are controlled by us.
for f in $files; do
    sum "$f" >> "$tmp"
done
mv "$tmp" SHA256SUMS

if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c SHA256SUMS
else
    shasum -a 256 -c SHA256SUMS
fi
