#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_SCRIPT="$ROOT_DIR/scripts/build-app-bundle.sh"
CONFIGURATION="${CONFIGURATION:-debug}"
APP_NAME="${INTENTIVE_APP_NAME:-Intentive}"
APP_VERSION="${INTENTIVE_APP_VERSION:-0.1.3}"
APP_BUILD="${INTENTIVE_APP_BUILD:-901}"
AUTH_CALLBACK_SCHEME="${INTENTIVE_AUTH_CALLBACK_SCHEME:-intentive-desktop}"
SPARKLE_FEED_URL="${INTENTIVE_SPARKLE_FEED_URL:-https://github.com/intentive-ai/intentive/releases/latest/download/appcast.xml}"
SPARKLE_PUBLIC_ED_KEY="${INTENTIVE_SPARKLE_PUBLIC_ED_KEY:-desktop-bundle-smoke-public-ed-key}"
SENTRY_DSN="${INTENTIVE_SENTRY_DSN:-https://public@example.invalid/1}"
POSTHOG_PROJECT_KEY="${INTENTIVE_POSTHOG_PROJECT_KEY:-phc_desktop_bundle_smoke}"
POSTHOG_HOST="${INTENTIVE_POSTHOG_HOST:-https://us.i.posthog.com}"
NATIVE_ASSETS_BUNDLE_NAME="IntentiveDesktop_IntentiveDesktopNativeAssets.bundle"

fail() {
  echo "Desktop bundle smoke failed: $*" >&2
  exit 1
}

read_plist() {
  /usr/libexec/PlistBuddy -c "Print :$1" "$PLIST"
}

assert_eq() {
  local key="$1"
  local expected="$2"
  local actual
  actual="$(read_plist "$key")"
  [[ "$actual" == "$expected" ]] || fail "$key expected '$expected', got '$actual'"
}

assert_nonempty_plist() {
  local key="$1"
  local actual
  actual="$(read_plist "$key")"
  [[ -n "$actual" ]] || fail "$key is empty"
}

APP_BUNDLE="$(
  CONFIGURATION="$CONFIGURATION" \
    INTENTIVE_APP_NAME="$APP_NAME" \
    INTENTIVE_APP_VERSION="$APP_VERSION" \
    INTENTIVE_APP_BUILD="$APP_BUILD" \
    INTENTIVE_AUTH_CALLBACK_SCHEME="$AUTH_CALLBACK_SCHEME" \
    INTENTIVE_SPARKLE_FEED_URL="$SPARKLE_FEED_URL" \
    INTENTIVE_SPARKLE_PUBLIC_ED_KEY="$SPARKLE_PUBLIC_ED_KEY" \
    INTENTIVE_SENTRY_DSN="$SENTRY_DSN" \
    INTENTIVE_POSTHOG_PROJECT_KEY="$POSTHOG_PROJECT_KEY" \
    INTENTIVE_POSTHOG_HOST="$POSTHOG_HOST" \
    "$BUILD_SCRIPT" | tail -n 1
)"

[[ -d "$APP_BUNDLE" ]] || fail "app bundle missing at $APP_BUNDLE"

PLIST="$APP_BUNDLE/Contents/Info.plist"
EXECUTABLE="$APP_BUNDLE/Contents/MacOS/Intentive"
APP_ICON="$APP_BUNDLE/Contents/Resources/AppIcon.icns"
NATIVE_ASSETS_BUNDLE="$APP_BUNDLE/Contents/Resources/$NATIVE_ASSETS_BUNDLE_NAME"
VAD_MODEL="$NATIVE_ASSETS_BUNDLE/silero_vad.onnx"
SPARKLE_FRAMEWORK="$APP_BUNDLE/Contents/Frameworks/Sparkle.framework"
SENTRY_FRAMEWORK="$APP_BUNDLE/Contents/Frameworks/Sentry.framework"

[[ -f "$PLIST" ]] || fail "Info.plist missing"
[[ -x "$EXECUTABLE" ]] || fail "executable missing or not executable: $EXECUTABLE"
[[ -s "$APP_ICON" ]] || fail "AppIcon.icns missing or empty"
[[ -d "$NATIVE_ASSETS_BUNDLE" ]] || fail "native assets bundle missing: $NATIVE_ASSETS_BUNDLE"
[[ -s "$VAD_MODEL" ]] || fail "silero_vad.onnx missing from native assets bundle"
[[ -d "$SPARKLE_FRAMEWORK" ]] || fail "Sparkle.framework missing"
[[ -d "$SENTRY_FRAMEWORK" ]] || fail "Sentry.framework missing"

plutil -lint "$PLIST" >/dev/null

assert_eq "CFBundleExecutable" "Intentive"
assert_eq "CFBundleIdentifier" "com.intentive.desktop"
assert_eq "CFBundleIconFile" "AppIcon"
assert_eq "CFBundleName" "$APP_NAME"
assert_eq "CFBundlePackageType" "APPL"
assert_eq "CFBundleShortVersionString" "$APP_VERSION"
assert_eq "CFBundleVersion" "$APP_BUILD"
assert_eq "LSMinimumSystemVersion" "14.0"
assert_eq "CFBundleURLTypes:0:CFBundleURLSchemes:0" "$AUTH_CALLBACK_SCHEME"
assert_eq "SUFeedURL" "$SPARKLE_FEED_URL"
assert_eq "SUPublicEDKey" "$SPARKLE_PUBLIC_ED_KEY"
assert_eq "SUEnableAutomaticChecks" "true"
assert_eq "SUAutomaticallyUpdate" "false"
assert_eq "SUScheduledCheckInterval" "3600"
assert_eq "IntentiveSentryDSN" "$SENTRY_DSN"
assert_eq "IntentivePostHogProjectKey" "$POSTHOG_PROJECT_KEY"
assert_eq "IntentivePostHogHost" "$POSTHOG_HOST"

assert_nonempty_plist "NSScreenCaptureUsageDescription"
assert_nonempty_plist "NSAppleEventsUsageDescription"
assert_nonempty_plist "NSMicrophoneUsageDescription"
assert_nonempty_plist "NSSpeechRecognitionUsageDescription"
assert_nonempty_plist "NSAudioCaptureUsageDescription"

if plutil -p "$PLIST" | rg -q "com\\.omi|Omi|omi-computer"; then
  fail "Info.plist contains stale Omi identity"
fi

echo "Desktop bundle smoke passed: $APP_BUNDLE"
