#!/bin/sh
# Accept a release tag only if it is v<workspace version> or
# v<workspace version>-rc.<N>, where the workspace version is
# [workspace.package] version in the root Cargo.toml.
#
# Usage: check-tag.sh <tag>
set -eu

if [ "$#" -ne 1 ]; then
    echo "usage: $0 <tag>" >&2
    exit 2
fi

tag=$1
root=$(cd "$(dirname "$0")/../.." && pwd)
manifest=${CARGO_MANIFEST:-$root/Cargo.toml}

version=$(awk '
    /^\[/ { in_ws = ($0 == "[workspace.package]") }
    in_ws && /^version[ \t]*=/ {
        gsub(/^[^"]*"|"[^"]*$/, "")
        print
        exit
    }
' "$manifest")

if [ -z "$version" ]; then
    echo "error: no [workspace.package] version in $manifest" >&2
    exit 1
fi

case "$tag" in
    "v$version") ;;
    "v$version"-rc.*)
        n=${tag#"v$version-rc."}
        case "$n" in
            '' | *[!0-9]* | 0[0-9]*)
                echo "error: tag '$tag' has an invalid rc number; expected v$version-rc.<N> with N a positive integer" >&2
                exit 1
                ;;
        esac
        if [ "$n" -eq 0 ]; then
            echo "error: tag '$tag' has an invalid rc number; expected v$version-rc.<N> with N >= 1" >&2
            exit 1
        fi
        ;;
    *)
        echo "error: tag '$tag' does not match workspace version $version; expected v$version or v$version-rc.<N>" >&2
        exit 1
        ;;
esac

echo "ok: $tag (workspace version $version)"
