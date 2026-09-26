#!/bin/sh
# Rebuild src-tauri/icons from the hand-made sizes in assets/brand.
# The design drops the painting at 32 px and below, so small sizes must come from
# their own PNGs instead of being downscaled from 1024 (which `tauri icon` would do).
# Needs macOS `iconutil` and ImageMagick `magick`.
set -eu

root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
brand="$root/assets/brand"
out="$root/src-tauri/icons"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

set_dir="$work/icon.iconset"
mkdir -p "$set_dir" "$out"

cp "$brand/app-icon-16.png" "$set_dir/icon_16x16.png"
cp "$brand/app-icon-32.png" "$set_dir/icon_16x16@2x.png"
cp "$brand/app-icon-32.png" "$set_dir/icon_32x32.png"
cp "$brand/app-icon-64.png" "$set_dir/icon_32x32@2x.png"
cp "$brand/app-icon-128.png" "$set_dir/icon_128x128.png"
cp "$brand/app-icon-256.png" "$set_dir/icon_128x128@2x.png"
cp "$brand/app-icon-256.png" "$set_dir/icon_256x256.png"
cp "$brand/app-icon-512.png" "$set_dir/icon_256x256@2x.png"
cp "$brand/app-icon-512.png" "$set_dir/icon_512x512.png"
cp "$brand/app-icon-1024.png" "$set_dir/icon_512x512@2x.png"
iconutil -c icns "$set_dir" -o "$out/icon.icns"

cp "$brand/app-icon-32.png" "$out/32x32.png"
cp "$brand/app-icon-128.png" "$out/128x128.png"
cp "$brand/app-icon-256.png" "$out/128x128@2x.png"
cp "$brand/app-icon-512.png" "$out/icon.png"

magick "$brand/app-icon-16.png" "$brand/app-icon-32.png" "$brand/app-icon-64.png" \
  "$brand/app-icon-128.png" "$brand/app-icon-256.png" "$out/icon.ico"

echo "icons written to $out"
