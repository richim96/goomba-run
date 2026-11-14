#!/bin/bash
# Builds "Goomba Run.app" for macOS and zips it.
# Needs only the Xcode Command Line Tools. Run with: npm run app:mac
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=release
APP="$OUT/Goomba Run.app"
ZIP="$OUT/Goomba Run for Mac.zip"
WORK="${TMPDIR:-/tmp}/goomba-run-mac-build"
SDK=$(xcrun --show-sdk-path 2>/dev/null || echo /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk)
SWIFTC=$(xcrun --find swiftc 2>/dev/null || echo swiftc)

npm run build --silent

rm -rf "$OUT" "$WORK"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$WORK"

# icon
node --no-warnings scripts/make-icons.ts --icns "$APP/Contents/Resources/AppIcon.icns" >/dev/null

# Apple Silicon build (macOS 12 and later)
compile() { # <arch> <minimum macOS>
  "$SWIFTC" -O -swift-version 5 -sdk "$SDK" -target "$1-apple-macos$2" \
    -module-cache-path "$WORK/module-cache" \
    native/mac/main.swift -o "$WORK/GoombaRun-$1"
}
compile arm64 12.0
# Intel build too, when this toolchain can still produce one (newer ones only
# manage it for macOS 14 and later, or not at all)
if compile x86_64 14.0 2>"$WORK/intel.log"; then
  lipo -create "$WORK/GoombaRun-arm64" "$WORK/GoombaRun-x86_64" -output "$APP/Contents/MacOS/GoombaRun"
  echo "binary: universal (Apple Silicon + Intel)"
else
  cp "$WORK/GoombaRun-arm64" "$APP/Contents/MacOS/GoombaRun"
  echo "binary: Apple Silicon only (this toolchain cannot build for Intel Macs)"
fi

cp dist/index.html "$APP/Contents/Resources/index.html"
cp native/mac/Info.plist "$APP/Contents/Info.plist"

# ad-hoc signature: required for the app to run on Apple Silicon (it is not a Developer ID signature)
codesign --force --sign - "$APP"
codesign --verify --strict "$APP"

# plain zip, without macOS extended attributes (they would add ._ files inside the app)
ditto -c -k --norsrc --noextattr --keepParent "$APP" "$ZIP"
rm -rf "$WORK"
echo "built: $APP ($(du -sh "$APP" | cut -f1))"
echo "zip:   $ZIP ($(du -h "$ZIP" | cut -f1))"
