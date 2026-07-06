#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_PATH="$ROOT_DIR/Desktop"
CONFIGURATION="${CONFIGURATION:-release}"
APP_NAME="${INTENTIVE_APP_NAME:-Intentive}"
BUILD_DIR="$PACKAGE_PATH/.build/$CONFIGURATION"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"

xcrun swift build -c "$CONFIGURATION" --package-path "$PACKAGE_PATH"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
cp "$BUILD_DIR/Intentive" "$APP_BUNDLE/Contents/MacOS/Intentive"
cat > "$APP_BUNDLE/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>Intentive</string>
  <key>CFBundleIdentifier</key>
  <string>com.intentive.desktop</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSMicrophoneUsageDescription</key>
  <string>Intentive uses the microphone only for local push-to-talk transcription.</string>
  <key>NSCameraUsageDescription</key>
  <string>Intentive does not use the camera.</string>
  <key>NSScreenCaptureDescription</key>
  <string>Intentive uses screen capture to build local Screen Memory and compact perception events.</string>
</dict>
</plist>
PLIST

echo "$APP_BUNDLE"
