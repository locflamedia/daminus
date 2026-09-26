#!/bin/sh
# Fixture test for check-core-boundaries.sh: every banned import form must fail
# the check, and harmless code that merely mentions the names must pass.
set -eu

here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
check="$here/check-core-boundaries.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

failures=0

# expect <pass|fail> <description> <rust source>
expect() {
  want=$1
  desc=$2
  dir="$tmp/case"
  rm -rf "$dir"
  mkdir -p "$dir"
  printf '%s\n' "$3" >"$dir/mod.rs"
  if "$check" "$dir" >/dev/null 2>&1; then got=pass; else got=fail; fi
  if [ "$got" = "$want" ]; then
    echo "ok   - $desc"
  else
    echo "FAIL - $desc (expected $want, got $got)"
    failures=$((failures + 1))
  fi
}

expect fail 'plain path import' 'use crate::ai::AiClient;'
expect fail 'aliased module import' 'use crate::ssh as transport;'
expect fail 'aliased grouped import' 'use crate::{probe as p};'
expect fail 'grouped import among others' 'use crate::{domain::Host, store};'
expect fail 'multi-line grouped import' "$(printf 'use crate::{\n    model::X,\n    ai,\n};')"
expect fail 'super path' 'use super::super::store::Db;'
expect fail 'crate name path' 'use daminus_core::probe::Scan;'
expect fail 'inline path expression' 'fn f() { crate::ssh::connect(); }'
expect pass 'local variable named ai' 'fn f(ai: u8) -> u8 { return ai; }'
expect pass 'banned names only in comments' "$(printf '// use crate::ssh;\n/* crate::ai::X */\nfn f() {}')"
expect pass 'banned names only in strings' 'const S: &str = "crate::store";'
expect pass 'similar module names' 'use crate::domain::{storage, ssh_config_view};'

if [ "$failures" -ne 0 ]; then
  echo "check-core-boundaries fixtures: $failures failing case(s)" >&2
  exit 1
fi
echo "check-core-boundaries fixtures: all passed"
