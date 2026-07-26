#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_PATH="$ROOT_DIR/Desktop"
SWIFTPM="$ROOT_DIR/scripts/swiftpm.sh"
VAD_MODEL_VERIFIER="$ROOT_DIR/scripts/verify-silero-vad-model.sh"
PUBLIC_ENDPOINT_VERIFIER="$ROOT_DIR/scripts/verify-public-endpoint.sh"
CONFIGURATION="${CONFIGURATION:-release}"
APP_NAME="${INTENTIVE_APP_NAME:-Intentive}"
BUNDLE_ID="${INTENTIVE_BUNDLE_ID:-com.heyintentive.desktop}"
APP_VERSION="${INTENTIVE_APP_VERSION:-0.1.0}"
APP_BUILD="${INTENTIVE_APP_BUILD:-1}"
AUTH_CALLBACK_SCHEME="${INTENTIVE_AUTH_CALLBACK_SCHEME:-intentive-desktop}"
LAUNCH_AGENT_LABEL="${INTENTIVE_LAUNCH_AGENT_LABEL:-$BUNDLE_ID.login-launcher-v1}"
LAUNCH_AGENT_PLIST_NAME="$BUNDLE_ID.login-launcher-v1.plist"
LEGACY_LAUNCH_AGENT_LABEL="$BUNDLE_ID.login"
LEGACY_LAUNCH_AGENT_PLIST_NAME="com.heyintentive.desktop.login.plist"
CONTROL_PLANE_URL="${INTENTIVE_CONTROL_PLANE_URL:-}"
HOSTED_AUTH_URL="${INTENTIVE_HOSTED_AUTH_URL:-}"
AUTH_TOKEN_EXCHANGE_URL="${INTENTIVE_AUTH_TOKEN_EXCHANGE_URL:-}"
SPARKLE_FEED_URL="${INTENTIVE_SPARKLE_FEED_URL:-}"
SPARKLE_PUBLIC_ED_KEY="${INTENTIVE_SPARKLE_PUBLIC_ED_KEY:-}"
SENTRY_DSN="${INTENTIVE_SENTRY_DSN:-}"
POSTHOG_PROJECT_KEY="${INTENTIVE_POSTHOG_PROJECT_KEY:-}"
POSTHOG_HOST="${INTENTIVE_POSTHOG_HOST:-https://us.i.posthog.com}"
APP_ICON_SOURCE="$PACKAGE_PATH/Sources/Resources/AppIcon.icns"
# The Silero VAD weights are a resource of the IntentiveDesktopNativeAdapters
# target that owns the microphone voice-activity gate, so SwiftPM emits them in
# that target's bundle. Copy it under its real name; do not duplicate the model.
NATIVE_ADAPTERS_BUNDLE_NAME="IntentiveDesktop_IntentiveDesktopNativeAdapters.bundle"
INTENTIVE_UI_BUNDLE_NAME="IntentiveDesktop_Intentive.bundle"
VAD_MODEL_SOURCE="$PACKAGE_PATH/Sources/IntentiveDesktopNativeAdapters/Resources/silero_vad.onnx"

if [[ "$CONFIGURATION" == "release" ]] \
  && [[ "$BUNDLE_ID" == "com.heyintentive.desktop" \
    || "$BUNDLE_ID" == "com.heyintentive.desktop.preview" ]]; then
  "$PUBLIC_ENDPOINT_VERIFIER" "INTENTIVE_CONTROL_PLANE_URL" "$CONTROL_PLANE_URL"
  "$PUBLIC_ENDPOINT_VERIFIER" "INTENTIVE_HOSTED_AUTH_URL" "$HOSTED_AUTH_URL"
  if [[ -n "$AUTH_TOKEN_EXCHANGE_URL" ]]; then
    "$PUBLIC_ENDPOINT_VERIFIER" \
      "INTENTIVE_AUTH_TOKEN_EXCHANGE_URL" "$AUTH_TOKEN_EXCHANGE_URL"
  fi
fi

"$VAD_MODEL_VERIFIER" "$VAD_MODEL_SOURCE" >/dev/null

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
BUNDLE_ID_XML="$(xml_escape "$BUNDLE_ID")"
APP_VERSION_XML="$(xml_escape "$APP_VERSION")"
APP_BUILD_XML="$(xml_escape "$APP_BUILD")"
AUTH_CALLBACK_SCHEME_XML="$(xml_escape "$AUTH_CALLBACK_SCHEME")"
LAUNCH_AGENT_LABEL_XML="$(xml_escape "$LAUNCH_AGENT_LABEL")"
LEGACY_LAUNCH_AGENT_LABEL_XML="$(xml_escape "$LEGACY_LAUNCH_AGENT_LABEL")"
CONTROL_PLANE_URL_XML="$(xml_escape "$CONTROL_PLANE_URL")"
HOSTED_AUTH_URL_XML="$(xml_escape "$HOSTED_AUTH_URL")"
AUTH_TOKEN_EXCHANGE_URL_XML="$(xml_escape "$AUTH_TOKEN_EXCHANGE_URL")"
SPARKLE_FEED_URL_XML="$(xml_escape "$SPARKLE_FEED_URL")"
SPARKLE_PUBLIC_ED_KEY_XML="$(xml_escape "$SPARKLE_PUBLIC_ED_KEY")"
SENTRY_DSN_XML="$(xml_escape "$SENTRY_DSN")"
POSTHOG_PROJECT_KEY_XML="$(xml_escape "$POSTHOG_PROJECT_KEY")"
POSTHOG_HOST_XML="$(xml_escape "$POSTHOG_HOST")"

"$SWIFTPM" build -c "$CONFIGURATION" --package-path "$PACKAGE_PATH"
BUILD_DIR="$("$SWIFTPM" build -c "$CONFIGURATION" --package-path "$PACKAGE_PATH" --show-bin-path)"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"
NATIVE_ADAPTERS_BUNDLE_SOURCE="$BUILD_DIR/$NATIVE_ADAPTERS_BUNDLE_NAME"
INTENTIVE_UI_BUNDLE_SOURCE="$BUILD_DIR/$INTENTIVE_UI_BUNDLE_NAME"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources" "$APP_BUNDLE/Contents/Frameworks"
cp "$BUILD_DIR/Intentive" "$APP_BUNDLE/Contents/MacOS/Intentive"
cp "$BUILD_DIR/IntentiveLoginLauncher" \
  "$APP_BUNDLE/Contents/MacOS/IntentiveLoginLauncher"
# SwiftPM links binary frameworks with an @rpath install name but its standalone
# executable does not know the conventional app-bundle Frameworks directory.
# Add that bundle-relative lookup before signing so assembled debug and release
# apps launch the frameworks copied below instead of aborting in dyld.
if ! otool -l "$APP_BUNDLE/Contents/MacOS/Intentive" \
  | grep -Fq 'path @executable_path/../Frameworks'; then
  install_name_tool \
    -add_rpath '@executable_path/../Frameworks' \
    "$APP_BUNDLE/Contents/MacOS/Intentive"
  # `swift build` emits an ad-hoc signature. Mach-O load-command edits
  # invalidate it, so restore an ad-hoc executable signature for local bundles;
  # public release signing replaces this after the complete app is assembled.
  codesign --force --sign - "$APP_BUNDLE/Contents/MacOS/Intentive"
fi
for framework in Sparkle.framework Sentry.framework; do
  if [[ ! -d "$BUILD_DIR/$framework" ]]; then
    echo "Missing release framework: $BUILD_DIR/$framework" >&2
    exit 1
  fi
  cp -R "$BUILD_DIR/$framework" "$APP_BUNDLE/Contents/Frameworks/$framework"
done
cp "$APP_ICON_SOURCE" "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
if [[ ! -d "$NATIVE_ADAPTERS_BUNDLE_SOURCE" ]]; then
  echo "Missing native adapters bundle: $NATIVE_ADAPTERS_BUNDLE_SOURCE" >&2
  exit 1
fi
# Signed macOS bundles must keep resources under Contents/Resources. Shipped
# code resolves this path before using SwiftPM's build-tree Bundle.module
# fallback, so the artifact remains portable to a clean machine.
cp -R "$NATIVE_ADAPTERS_BUNDLE_SOURCE" "$APP_BUNDLE/Contents/Resources/$NATIVE_ADAPTERS_BUNDLE_NAME"
if [[ ! -d "$INTENTIVE_UI_BUNDLE_SOURCE" ]]; then
  echo "Missing Intentive UI resources bundle: $INTENTIVE_UI_BUNDLE_SOURCE" >&2
  exit 1
fi
cp -R "$INTENTIVE_UI_BUNDLE_SOURCE" "$APP_BUNDLE/Contents/Resources/$INTENTIVE_UI_BUNDLE_NAME"

# Bundled LaunchAgent for launch-at-login (ADR 0011). The versioned label and
# plist filename intentionally create a fresh Background Task Management
# identity instead of reusing a stale launch constraint from an older Preview.
# `BundleProgram` keeps the one-shot launcher's path bundle-relative so it
# survives moves. The helper starts the main app with `--background` only when
# no Intentive instance is already running.
mkdir -p "$APP_BUNDLE/Contents/Library/LaunchAgents"
cat > "$APP_BUNDLE/Contents/Library/LaunchAgents/$LAUNCH_AGENT_PLIST_NAME" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LAUNCH_AGENT_LABEL_XML</string>
  <key>BundleProgram</key>
  <string>Contents/MacOS/IntentiveLoginLauncher</string>
  <key>ProgramArguments</key>
  <array>
    <string>Contents/MacOS/IntentiveLoginLauncher</string>
  </array>
  <key>AssociatedBundleIdentifiers</key>
  <array>
    <string>$BUNDLE_ID_XML</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
PLIST
plutil -lint "$APP_BUNDLE/Contents/Library/LaunchAgents/$LAUNCH_AGENT_PLIST_NAME" >/dev/null

# Keep a non-starting plist for the old label so the app can ask
# `SMAppService` to unregister exactly that stale Intentive item after its
# Coaching Window has shut down. It is never registered by current code and
# avoids the destructive `sfltool resetbtm` workaround.
cat > "$APP_BUNDLE/Contents/Library/LaunchAgents/$LEGACY_LAUNCH_AGENT_PLIST_NAME" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LEGACY_LAUNCH_AGENT_LABEL_XML</string>
  <key>BundleProgram</key>
  <string>Contents/MacOS/IntentiveLoginLauncher</string>
  <key>ProgramArguments</key>
  <array>
    <string>Contents/MacOS/IntentiveLoginLauncher</string>
  </array>
  <key>AssociatedBundleIdentifiers</key>
  <array>
    <string>$BUNDLE_ID_XML</string>
  </array>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLIST
plutil -lint \
  "$APP_BUNDLE/Contents/Library/LaunchAgents/$LEGACY_LAUNCH_AGENT_PLIST_NAME" \
  >/dev/null

cat > "$APP_BUNDLE/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>Intentive</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID_XML</string>
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
  <string>Intentive optionally transcribes ambient microphone context on this Mac; raw audio is not retained.</string>
  <key>NSCameraUsageDescription</key>
  <string>Intentive does not use the camera.</string>
  <key>NSScreenCaptureUsageDescription</key>
  <string>Intentive uses screen capture to build local Screen Memory and compact perception events.</string>
  <key>NSAppleEventsUsageDescription</key>
  <string>Intentive uses active app metadata to keep Screen Memory accurate without uploading raw frames.</string>
  <key>NSAudioCaptureUsageDescription</key>
  <string>Intentive optionally transcribes system-audio meeting context on this Mac; raw audio is not retained.</string>
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

if [[ -n "$CONTROL_PLANE_URL" ]]; then
  cat >> "$APP_BUNDLE/Contents/Info.plist" <<PLIST
  <key>IntentiveControlPlaneURL</key>
  <string>$CONTROL_PLANE_URL_XML</string>
PLIST
fi

if [[ -n "$HOSTED_AUTH_URL" ]]; then
  cat >> "$APP_BUNDLE/Contents/Info.plist" <<PLIST
  <key>IntentiveHostedAuthURL</key>
  <string>$HOSTED_AUTH_URL_XML</string>
PLIST
fi

if [[ -n "$AUTH_TOKEN_EXCHANGE_URL" ]]; then
  cat >> "$APP_BUNDLE/Contents/Info.plist" <<PLIST
  <key>IntentiveAuthTokenExchangeURL</key>
  <string>$AUTH_TOKEN_EXCHANGE_URL_XML</string>
PLIST
fi

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

if [[ -n "$SENTRY_DSN" ]]; then
  cat >> "$APP_BUNDLE/Contents/Info.plist" <<PLIST
  <key>IntentiveSentryDSN</key>
  <string>$SENTRY_DSN_XML</string>
PLIST
fi

if [[ -n "$POSTHOG_PROJECT_KEY" ]]; then
  cat >> "$APP_BUNDLE/Contents/Info.plist" <<PLIST
  <key>IntentivePostHogProjectKey</key>
  <string>$POSTHOG_PROJECT_KEY_XML</string>
  <key>IntentivePostHogHost</key>
  <string>$POSTHOG_HOST_XML</string>
PLIST
fi

cat >> "$APP_BUNDLE/Contents/Info.plist" <<PLIST
</dict>
</plist>
PLIST

plutil -lint "$APP_BUNDLE/Contents/Info.plist" >/dev/null

echo "$APP_BUNDLE"
