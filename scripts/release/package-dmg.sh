#!/bin/sh
# Build the Daminus installer DMG from a built, ad-hoc signed .app bundle.
#
# Usage: package-dmg.sh <path/to/Daminus.app> <out.dmg> [volume-name]
#
# Requires dmgbuild (scripts/release/requirements.txt) on PATH. Works headless:
# dmgbuild writes the .DS_Store itself instead of driving Finder.
set -eu

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
    echo "usage: $0 <path/to/Daminus.app> <out.dmg> [volume-name]" >&2
    exit 2
fi

app=$1
out=$2
volume=${3:-Daminus}
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)

if [ ! -d "$app/Contents" ]; then
    echo "error: not an app bundle: $app" >&2
    exit 1
fi
if ! command -v dmgbuild >/dev/null 2>&1; then
    echo "error: dmgbuild not found; run: pip install --require-hashes -r scripts/release/requirements.txt" >&2
    exit 1
fi

if ! codesign --verify --deep --strict "$app" 2>/dev/null; then
    echo "error: codesign verification failed for $app" >&2
    exit 1
fi
if ! codesign -dv "$app" 2>&1 | grep -q '^Signature=adhoc$'; then
    echo "error: $app is not ad-hoc signed (expected Signature=adhoc)" >&2
    exit 1
fi

mkdir -p "$(dirname "$out")"
rm -f "$out"
dmgbuild -s "$here/dmg-settings.py" -D "app=$app" -D "root=$root" "$volume" "$out"
echo "wrote $out"
