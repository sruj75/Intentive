#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_PATH="$ROOT_DIR/Desktop"
CONFIGURATION="${CONFIGURATION:-release}"
APP_NAME="${INTENTIVE_APP_NAME:-Intentive}"
APP_VERSION="${INTENTIVE_APP_VERSION:-0.1.0}"
APP_BUILD="${INTENTIVE_APP_BUILD:-1}"
AUTH_CALLBACK_SCHEME="${INTENTIVE_AUTH_CALLBACK_SCHEME:-intentive-desktop}"
SPARKLE_FEED_URL="${INTENTIVE_SPARKLE_FEED_URL:-}"
SPARKLE_PUBLIC_ED_KEY="${INTENTIVE_SPARKLE_PUBLIC_ED_KEY:-}"
BUILD_DIR="$PACKAGE_PATH/.build/$CONFIGURATION"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"
APP_ICON_SOURCE="$PACKAGE_PATH/Sources/Resources/AppIcon.icns"
NATIVE_ASSETS_BUNDLE_NAME="IntentiveDesktop_IntentiveDesktopNativeAssets.bundle"
NATIVE_ASSETS_BUNDLE_SOURCE="$BUILD_DIR/$NATIVE_ASSETS_BUNDLE_NAME"

if [[ -z "$SPARKLE_FEED_URL" && -n "${GITHUB_REPOSITORY:-}" ]]; then
  SPARKLE_FEED_URL="https://github.com/${GITHUB_REPOSITORY}/releases/latest/download/appcast.xml"
fi

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  printf '%s' "$value"
}

APP_NAME_XML="$(xml_escape "$APP_NAME")"
APP_VERSION_XML="$(xml_escape "$APP_VERSION")"
APP_BUILD_XML="$(xml_escape "$APP_BUILD")"
AUTH_CALLBACK_SCHEME_XML="$(xml_escape "$AUTH_CALLBACK_SCHEME")"
SPARKLE_FEED_URL_XML="$(xml_escape "$SPARKLE_FEED_URL")"
SPARKLE_PUBLIC_ED_KEY_XML="$(xml_escape "$SPARKLE_PUBLIC_ED_KEY")"

xcrun swift build -c "$CONFIGURATION" --package-path "$PACKAGE_PATH"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
cp "$BUILD_DIR/Intentive" "$APP_BUNDLE/Contents/MacOS/Intentive"
cp "$APP_ICON_SOURCE" "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
if [[ ! -d "$NATIVE_ASSETS_BUNDLE_SOURCE" ]]; then
  echo "Missing native assets bundle: $NATIVE_ASSETS_BUNDLE_SOURCE" >&2
  exit 1
fi
cp -R "$NATIVE_ASSETS_BUNDLE_SOURCE" "$APP_BUNDLE/Contents/Resources/$NATIVE_ASSETS_BUNDLE_NAME"
cat > "$APP_BUNDLE/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>Intentive</string>
  <key>CFBundleIdentifier</key>
  <string>com.intentive.desktop</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleName</key>
  <string>$APP_NAME_XML</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$APP_VERSION_XML</string>
  <key>CFBundleVersion</key>
  <string>$APP_BUILD_XML</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSMicrophoneUsageDescription</key>
    <string>Intentive uses the microphone for local push-to-talk speech recognition and optional ambient audio summaries.</string>
  <key>NSSpeechRecognitionUsageDescription</key>
  <string>Intentive performs speech recognition on device for push-to-talk voice turns.</string>
  <key>NSCameraUsageDescription</key>
  <string>Intentive does not use the camera.</string>
  <key>NSScreenCaptureUsageDescription</key>
  <string>Intentive uses screen capture to build local Screen Memory and compact perception events.</string>
  <key>NSAppleEventsUsageDescription</key>
  <string>Intentive uses active app metadata to keep Screen Memory accurate without uploading raw frames.</string>
  <key>NSAudioCaptureUsageDescription</key>
  <string>Intentive uses system audio only for local push-to-talk and meeting transcription features.</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>Intentive Hosted Auth Callback</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>$AUTH_CALLBACK_SCHEME_XML</string>
      </array>
    </dict>
  </array>
PLIST

if [[ -n "$SPARKLE_FEED_URL" ]]; then
  cat >> "$APP_BUNDLE/Contents/Info.plist" <<PLIST
  <key>SUFeedURL</key>
  <string>$SPARKLE_FEED_URL_XML</string>
PLIST
fi

if [[ -n "$SPARKLE_PUBLIC_ED_KEY" ]]; then
  cat >> "$APP_BUNDLE/Contents/Info.plist" <<PLIST
  <key>SUPublicEDKey</key>
  <string>$SPARKLE_PUBLIC_ED_KEY_XML</string>
  <key>SUEnableAutomaticChecks</key>
  <true/>
  <key>SUAutomaticallyUpdate</key>
  <false/>
  <key>SUScheduledCheckInterval</key>
  <integer>3600</integer>
PLIST
fi

cat >> "$APP_BUNDLE/Contents/Info.plist" <<PLIST
</dict>
</plist>
PLIST

plutil -lint "$APP_BUNDLE/Contents/Info.plist" >/dev/null

echo "$APP_BUNDLE"
