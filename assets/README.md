# App Icons

Place the following icon files in this directory for packaging:

- `icon.icns` — macOS app icon (required for DMG builds)
- `icon.ico` — Windows app icon (required for Squirrel/Windows builds)
- `icon.png` — 512×512 PNG source icon (used for Linux and as source for conversions)

## Generating icons

From a source `icon.png` (512×512 or 1024×1024):

### macOS (.icns)
```bash
# Using iconutil (macOS only)
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
```

### Windows (.ico)
```bash
# Using ImageMagick
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```
