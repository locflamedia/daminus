#!/bin/sh
# Regenerate the committed TypeScript bindings (ts-rs) and fail if they drift
# from what is in git, including new or deleted files.
set -eu

root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"

bindings="src/api/bindings"
find "$bindings" -name '*.ts' -type f -delete
# ts-rs writes one file per `#[ts(export)]` type while running these tests.
cargo test -p daminus-core --features ts --quiet export_bindings

if [ -n "$(git status --porcelain -- "$bindings")" ]; then
  git status --short -- "$bindings" >&2
  git diff -- "$bindings" >&2
  echo "bindings: generated TypeScript differs from the committed files; run scripts/check-bindings.sh and commit" >&2
  exit 1
fi

echo "bindings: up to date"
