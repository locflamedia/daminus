#!/bin/sh
# The Tauri CLI refuses to build when a crate and its npm twin differ in major.minor.
# Compare what Cargo.lock and the installed node_modules resolve (run after install), so a dependency bump on
# one side fails in a pull request instead of at release time.
set -eu

root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)

crate_version() {
  awk -v n="$1" '$0 == "name = \"" n "\"" { getline; gsub(/version = |"/, ""); print; exit }' "$root/Cargo.lock"
}

npm_version() {
  # The copy the Tauri CLI sees: the direct dependency installed in node_modules.
  sed -n 's/^  "version": "\(.*\)",$/\1/p' "$root/node_modules/$1/package.json" | head -n 1
}

minor() { echo "$1" | cut -d. -f1,2; }

status=0
check() {
  crate=$1
  pkg=$2
  c=$(crate_version "$crate")
  n=$(npm_version "$pkg")
  if [ -z "$c" ] || [ -z "$n" ]; then
    echo "cannot read versions for $crate / $pkg (crate '$c', npm '$n')" >&2
    status=1
  elif [ "$(minor "$c")" != "$(minor "$n")" ]; then
    echo "mismatch: crate $crate $c vs npm $pkg $n (major.minor must match)" >&2
    status=1
  else
    echo "ok: $crate $c, $pkg $n"
  fi
}

check tauri @tauri-apps/api
check tauri @tauri-apps/cli
check tauri-plugin-clipboard-manager @tauri-apps/plugin-clipboard-manager
exit "$status"
