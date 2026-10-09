# dmgbuild settings for the Daminus installer image.
# Invoked by package-dmg.sh with: -D app=<path to Daminus.app> -D root=<repo root>
#
# The background is assets/brand/dmg-background.png (660x400). dmgbuild finds
# the dmg-background@2x.png sibling on its own and combines both into a
# multi-resolution TIFF, so Retina displays get the 1320x800 art.
import os
import plistlib

app_path = os.path.abspath(defines["app"])  # noqa: F821 - injected by dmgbuild
app_name = os.path.basename(app_path)
repo_root = os.path.abspath(defines["root"])  # noqa: F821

with open(os.path.join(app_path, "Contents", "Info.plist"), "rb") as fh:
    icon_file = plistlib.load(fh).get("CFBundleIconFile", "icon.icns")
if not icon_file.endswith(".icns"):
    icon_file += ".icns"

format = "UDZO"  # noqa: A001
filesystem = "HFS+"

files = [app_path]
symlinks = {"Applications": "/Applications"}
icon = os.path.join(app_path, "Contents", "Resources", icon_file)

background = os.path.join(repo_root, "assets", "brand", "dmg-background.png")

show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
sidebar_width = 0

window_rect = ((200, 120), (660, 400))
default_view = "icon-view"
show_icon_preview = False

arrange_by = None
icon_size = 96
text_size = 13
label_pos = "bottom"

icon_locations = {
    app_name: (174, 190),
    "Applications": (486, 190),
}
