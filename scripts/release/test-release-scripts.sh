#!/bin/sh
# Tests for check-tag.sh and checksums.sh.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fail=0

expect_ok() {
    desc=$1
    shift
    if "$@" >/dev/null 2>&1; then echo "pass: $desc"; else echo "FAIL: $desc"; fail=1; fi
}
expect_fail() {
    desc=$1
    shift
    if "$@" >/dev/null 2>&1; then echo "FAIL: $desc"; fail=1; else echo "pass: $desc"; fi
}

printf '[workspace]\nmembers = []\n\n[workspace.package]\nversion = "1.2.3"\nedition = "2024"\n\n[package]\nversion = "9.9.9"\n' > "$work/Cargo.toml"
export CARGO_MANIFEST="$work/Cargo.toml"

expect_ok   "tag v1.2.3"        "$here/check-tag.sh" v1.2.3
expect_ok   "tag v1.2.3-rc.1"   "$here/check-tag.sh" v1.2.3-rc.1
expect_ok   "tag v1.2.3-rc.12"  "$here/check-tag.sh" v1.2.3-rc.12
expect_fail "tag 1.2.3"         "$here/check-tag.sh" 1.2.3
expect_fail "tag v1.2.4"        "$here/check-tag.sh" v1.2.4
expect_fail "tag v9.9.9"        "$here/check-tag.sh" v9.9.9
expect_fail "tag v1.2.3-rc"     "$here/check-tag.sh" v1.2.3-rc
expect_fail "tag v1.2.3-rc."    "$here/check-tag.sh" v1.2.3-rc.
expect_fail "tag v1.2.3-rc.0"   "$here/check-tag.sh" v1.2.3-rc.0
expect_fail "tag v1.2.3-rc.x"   "$here/check-tag.sh" v1.2.3-rc.x
expect_fail "tag v1.2.3-beta.1" "$here/check-tag.sh" v1.2.3-beta.1
expect_fail "tag v1.2.3.1"      "$here/check-tag.sh" v1.2.3.1
expect_fail "tag empty"         "$here/check-tag.sh" ""
expect_fail "no argument"       "$here/check-tag.sh"
msg=$("$here/check-tag.sh" v0.0.1 2>&1 || true)
case "$msg" in *"v1.2.3"*) echo "pass: rejection message names expected version" ;; *) echo "FAIL: rejection message"; fail=1 ;; esac

# checksums.sh
d="$work/out"
mkdir "$d"
printf 'b' > "$d/b.dmg"
printf 'a' > "$d/a.dmg"
printf 'x' > "$d/notes.txt"
expect_ok "checksums writes and verifies" "$here/checksums.sh" "$d"
names=$(awk '{print $2}' "$d/SHA256SUMS" | tr '\n' ' ')
if [ "$names" = "a.dmg b.dmg " ]; then echo "pass: sorted bare names, dmg only"; else echo "FAIL: names '$names'"; fail=1; fi
want=$(printf 'a' | (sha256sum 2>/dev/null || shasum -a 256) | awk '{print $1}')
got=$(awk '$2 == "a.dmg" {print $1}' "$d/SHA256SUMS")
if [ "$want" = "$got" ]; then echo "pass: digest value"; else echo "FAIL: digest"; fail=1; fi
printf 'tampered' > "$d/a.dmg"
if (cd "$d" && { sha256sum -c SHA256SUMS 2>/dev/null || shasum -a 256 -c SHA256SUMS; }) >/dev/null 2>&1; then
    echo "FAIL: tamper not detected"; fail=1
else
    echo "pass: tamper detected"
fi
mkdir "$work/empty"
expect_fail "checksums rejects dir without dmg" "$here/checksums.sh" "$work/empty"
expect_fail "checksums rejects missing dir" "$here/checksums.sh" "$work/nope"

if [ "$fail" -ne 0 ]; then echo "some tests failed" >&2; exit 1; fi
echo "all tests passed"
