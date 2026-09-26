#!/bin/sh
# The pure domain must not depend on I/O modules. Fails if anything under
# crates/core/src/domain references the ssh, probe, ai or store modules.
#
# Usage: check-core-boundaries.sh [domain-dir]
# The optional argument exists so scripts/test-check-core-boundaries.sh can run
# the check against fixtures.
set -eu

root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
domain="${1:-$root/crates/core/src/domain}"

if [ ! -d "$domain" ]; then
  echo "core boundaries: no domain module yet, nothing to check"
  exit 0
fi

# Comments and string literals are stripped first, then two things are flagged:
#   1. any path that reaches a banned module: `crate::ssh`, `daminus_core::ai`,
#      `super::store`, `super::super::probe` (aliases like `as t` do not matter);
#   2. any banned name inside a grouped import rooted at crate/super/daminus_core,
#      e.g. `use crate::{probe as p};` or a multi-line `use crate::{\n  ai,\n};`.
# Local identifiers such as `return ai;` are not paths and are not flagged.
# shellcheck disable=SC2016 # the Perl program is meant to stay unexpanded
found=$(find "$domain" -type f -name '*.rs' -exec perl -0777 -ne '
  my $src = $_;
  $src =~ s{/\*.*?\*/}{ my $c = $&; $c =~ tr/\n//cd; $c }gse;
  $src =~ s{//[^\n]*}{}g;
  $src =~ s{"(?:\\.|[^"\\])*"}{""}gs;
  my $mods = qr/(?:ssh|probe|ai|store)/;
  my @hits;
  while ($src =~ /\b(?:crate|daminus_core|(?:super::)*super)::($mods)\b/g) {
    push @hits, [$-[0], "path to $1"];
  }
  while ($src =~ /\buse\s+(?:::)?(?:crate|daminus_core|(?:super::)*super)::\{([^;]*)\}\s*;/g) {
    my ($body, $start) = ($1, $-[1]);
    while ($body =~ /(?:^|[{,])\s*($mods)\b/g) {
      push @hits, [$start + $-[1], "grouped import of $1"];
    }
  }
  for my $h (@hits) {
    my $line = 1 + (() = substr($src, 0, $h->[0]) =~ /\n/g);
    print "$ARGV:$line: $h->[1]\n";
  }
' {} +)

if [ -n "$found" ]; then
  printf '%s\n' "$found"
  echo "core boundaries: domain/ must not import ssh, probe, ai or store" >&2
  exit 1
fi

echo "core boundaries: ok"
