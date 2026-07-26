#!/usr/bin/env bash
set -euo pipefail
export PATH="/bin:/usr/bin:/usr/sbin:/sbin"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_SCRIPT="$ROOT_DIR/scripts/build-app-bundle.sh"
VAD_MODEL_VERIFIER="$ROOT_DIR/scripts/verify-silero-vad-model.sh"
PUBLIC_ENDPOINT_VERIFIER="$ROOT_DIR/scripts/verify-public-endpoint.sh"
APP_BUNDLE=""
VERIFY_EXISTING=0

usage() {
  cat <<'EOF'
Usage: verify-app-bundle.sh [--app <path>]

Without --app, build and verify the deterministic synthetic production smoke
bundle. With --app, verify that exact existing bundle against the INTENTIVE_*
identity and configuration values supplied by the caller.
EOF
}

case "${1:-}" in
  "")
    ;;
  --app)
    [[ -n "${2:-}" && -z "${3:-}" ]] || {
      usage >&2
      exit 2
    }
    APP_BUNDLE="$2"
    VERIFY_EXISTING=1
    ;;
  --help|-h)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

CONFIGURATION="${CONFIGURATION:-debug}"
APP_NAME="${INTENTIVE_APP_NAME:-Intentive}"
APP_VERSION="${INTENTIVE_APP_VERSION:-0.1.3}"
APP_BUILD="${INTENTIVE_APP_BUILD:-901}"
AUTH_CALLBACK_SCHEME="${INTENTIVE_AUTH_CALLBACK_SCHEME:-intentive-desktop}"
if [[ "$VERIFY_EXISTING" == 1 ]]; then
  BUNDLE_ID="${INTENTIVE_BUNDLE_ID:-com.heyintentive.desktop}"
  CONTROL_PLANE_URL="${INTENTIVE_CONTROL_PLANE_URL:-}"
  HOSTED_AUTH_URL="${INTENTIVE_HOSTED_AUTH_URL:-}"
  AUTH_TOKEN_EXCHANGE_URL="${INTENTIVE_AUTH_TOKEN_EXCHANGE_URL:-}"
  SPARKLE_FEED_URL="${INTENTIVE_SPARKLE_FEED_URL:-}"
  SPARKLE_PUBLIC_ED_KEY="${INTENTIVE_SPARKLE_PUBLIC_ED_KEY:-}"
  SENTRY_DSN="${INTENTIVE_SENTRY_DSN:-}"
  POSTHOG_PROJECT_KEY="${INTENTIVE_POSTHOG_PROJECT_KEY:-}"
  POSTHOG_HOST="${INTENTIVE_POSTHOG_HOST:-https://us.i.posthog.com}"
else
  BUNDLE_ID="com.heyintentive.desktop"
  CONTROL_PLANE_URL="${INTENTIVE_CONTROL_PLANE_URL:-https://control-plane.bundle-smoke.test}"
  HOSTED_AUTH_URL="${INTENTIVE_HOSTED_AUTH_URL:-https://auth.bundle-smoke.test/sign-in}"
  AUTH_TOKEN_EXCHANGE_URL="${INTENTIVE_AUTH_TOKEN_EXCHANGE_URL:-https://auth.bundle-smoke.test/desktop/token}"
  SPARKLE_FEED_URL="${INTENTIVE_SPARKLE_FEED_URL:-https://github.com/intentive-ai/intentive/releases/latest/download/appcast.xml}"
  SPARKLE_PUBLIC_ED_KEY="${INTENTIVE_SPARKLE_PUBLIC_ED_KEY:-desktop-bundle-smoke-public-ed-key}"
  SENTRY_DSN="${INTENTIVE_SENTRY_DSN:-https://public@example.invalid/1}"
  POSTHOG_PROJECT_KEY="${INTENTIVE_POSTHOG_PROJECT_KEY:-phc_desktop_bundle_smoke}"
  POSTHOG_HOST="${INTENTIVE_POSTHOG_HOST:-https://us.i.posthog.com}"
fi
LAUNCH_AGENT_LABEL="${INTENTIVE_LAUNCH_AGENT_LABEL:-$BUNDLE_ID.login-launcher-v1}"
LAUNCH_AGENT_PLIST_NAME="$BUNDLE_ID.login-launcher-v1.plist"
LEGACY_LAUNCH_AGENT_LABEL="$BUNDLE_ID.login"
LEGACY_LAUNCH_AGENT_PLIST_NAME="com.heyintentive.desktop.login.plist"
# Silero VAD weights ship in the IntentiveDesktopNativeAdapters target bundle.
NATIVE_ADAPTERS_BUNDLE_NAME="IntentiveDesktop_IntentiveDesktopNativeAdapters.bundle"
INTENTIVE_UI_BUNDLE_NAME="IntentiveDesktop_Intentive.bundle"

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

assert_optional_plist() {
  local key="$1"
  local expected="$2"
  if [[ -n "$expected" ]]; then
    assert_eq "$key" "$expected"
  elif /usr/libexec/PlistBuddy -c "Print :$key" "$PLIST" >/dev/null 2>&1; then
    fail "$key must be absent when its build configuration is empty"
  fi
}

if [[ "$VERIFY_EXISTING" == 0 ]]; then
  APP_BUNDLE="$(
    CONFIGURATION="$CONFIGURATION" \
      INTENTIVE_APP_NAME="$APP_NAME" \
      INTENTIVE_BUNDLE_ID="$BUNDLE_ID" \
      INTENTIVE_APP_VERSION="$APP_VERSION" \
      INTENTIVE_APP_BUILD="$APP_BUILD" \
      INTENTIVE_AUTH_CALLBACK_SCHEME="$AUTH_CALLBACK_SCHEME" \
      INTENTIVE_CONTROL_PLANE_URL="$CONTROL_PLANE_URL" \
      INTENTIVE_HOSTED_AUTH_URL="$HOSTED_AUTH_URL" \
      INTENTIVE_AUTH_TOKEN_EXCHANGE_URL="$AUTH_TOKEN_EXCHANGE_URL" \
      INTENTIVE_SPARKLE_FEED_URL="$SPARKLE_FEED_URL" \
      INTENTIVE_SPARKLE_PUBLIC_ED_KEY="$SPARKLE_PUBLIC_ED_KEY" \
      INTENTIVE_SENTRY_DSN="$SENTRY_DSN" \
      INTENTIVE_POSTHOG_PROJECT_KEY="$POSTHOG_PROJECT_KEY" \
      INTENTIVE_POSTHOG_HOST="$POSTHOG_HOST" \
      "$BUILD_SCRIPT" | tail -n 1
  )"
fi

[[ -d "$APP_BUNDLE" ]] || fail "app bundle missing at $APP_BUNDLE"

PLIST="$APP_BUNDLE/Contents/Info.plist"
EXECUTABLE="$APP_BUNDLE/Contents/MacOS/Intentive"
LOGIN_LAUNCHER="$APP_BUNDLE/Contents/MacOS/IntentiveLoginLauncher"
APP_ICON="$APP_BUNDLE/Contents/Resources/AppIcon.icns"
NATIVE_ADAPTERS_BUNDLE="$APP_BUNDLE/Contents/Resources/$NATIVE_ADAPTERS_BUNDLE_NAME"
INTENTIVE_UI_BUNDLE="$APP_BUNDLE/Contents/Resources/$INTENTIVE_UI_BUNDLE_NAME"
MENU_BAR_ICON="$INTENTIVE_UI_BUNDLE/IntentiveMenuBarIcon.png"
VAD_MODEL="$NATIVE_ADAPTERS_BUNDLE/silero_vad.onnx"
SPARKLE_FRAMEWORK="$APP_BUNDLE/Contents/Frameworks/Sparkle.framework"
SENTRY_FRAMEWORK="$APP_BUNDLE/Contents/Frameworks/Sentry.framework"
LAUNCH_AGENT_PLIST="$APP_BUNDLE/Contents/Library/LaunchAgents/$LAUNCH_AGENT_PLIST_NAME"
LEGACY_LAUNCH_AGENT_PLIST="$APP_BUNDLE/Contents/Library/LaunchAgents/$LEGACY_LAUNCH_AGENT_PLIST_NAME"

[[ -f "$PLIST" ]] || fail "Info.plist missing"
[[ -x "$EXECUTABLE" ]] || fail "executable missing or not executable: $EXECUTABLE"
[[ -x "$LOGIN_LAUNCHER" ]] \
  || fail "login launcher missing or not executable: $LOGIN_LAUNCHER"
[[ -s "$APP_ICON" ]] || fail "AppIcon.icns missing or empty"
[[ -d "$NATIVE_ADAPTERS_BUNDLE" ]] || fail "native adapters bundle missing: $NATIVE_ADAPTERS_BUNDLE"
"$VAD_MODEL_VERIFIER" "$VAD_MODEL" >/dev/null \
  || fail "silero_vad.onnx failed release identity verification"
[[ -s "$MENU_BAR_ICON" ]] || fail "Intentive menu-bar icon missing from UI resources bundle"
[[ -d "$SPARKLE_FRAMEWORK" ]] || fail "Sparkle.framework missing"
[[ -d "$SENTRY_FRAMEWORK" ]] || fail "Sentry.framework missing"
[[ -f "$LAUNCH_AGENT_PLIST" ]] || fail "bundled LaunchAgent plist missing"
[[ -f "$LEGACY_LAUNCH_AGENT_PLIST" ]] \
  || fail "targeted legacy LaunchAgent retirement plist missing"

plutil -lint "$PLIST" >/dev/null
plutil -lint "$LAUNCH_AGENT_PLIST" >/dev/null \
  || fail "bundled LaunchAgent plist is invalid"
plutil -lint "$LEGACY_LAUNCH_AGENT_PLIST" >/dev/null \
  || fail "targeted legacy LaunchAgent retirement plist is invalid"

assert_eq "CFBundleExecutable" "Intentive"
assert_eq "CFBundleIdentifier" "$BUNDLE_ID"
assert_eq "CFBundleIconFile" "AppIcon"
assert_eq "CFBundleName" "$APP_NAME"
assert_eq "CFBundlePackageType" "APPL"
assert_eq "CFBundleShortVersionString" "$APP_VERSION"
assert_eq "CFBundleVersion" "$APP_BUILD"
assert_eq "LSMinimumSystemVersion" "14.0"
assert_eq "CFBundleURLTypes:0:CFBundleURLSchemes:0" "$AUTH_CALLBACK_SCHEME"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :Label' "$LAUNCH_AGENT_PLIST")" == "$LAUNCH_AGENT_LABEL" ]] \
  || fail "LaunchAgent Label does not match $LAUNCH_AGENT_LABEL"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :AssociatedBundleIdentifiers:0' "$LAUNCH_AGENT_PLIST")" == "$BUNDLE_ID" ]] \
  || fail "LaunchAgent bundle identity does not match $BUNDLE_ID"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :BundleProgram' "$LAUNCH_AGENT_PLIST")" == "Contents/MacOS/IntentiveLoginLauncher" ]] \
  || fail "LaunchAgent must run the one-shot login launcher"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:0' "$LAUNCH_AGENT_PLIST")" == "Contents/MacOS/IntentiveLoginLauncher" ]] \
  || fail "LaunchAgent ProgramArguments must invoke the one-shot login launcher"
if /usr/libexec/PlistBuddy -c "Print :ProgramArguments:1" \
  "$LAUNCH_AGENT_PLIST" >/dev/null 2>&1; then
  fail "LaunchAgent must not pass arguments directly to the one-shot login launcher"
fi
[[ "$(/usr/libexec/PlistBuddy -c 'Print :RunAtLoad' "$LAUNCH_AGENT_PLIST")" == "true" ]] \
  || fail "LaunchAgent must run once when the user session loads"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :Label' "$LEGACY_LAUNCH_AGENT_PLIST")" == "$LEGACY_LAUNCH_AGENT_LABEL" ]] \
  || fail "legacy retirement plist must target only $LEGACY_LAUNCH_AGENT_LABEL"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :AssociatedBundleIdentifiers:0' "$LEGACY_LAUNCH_AGENT_PLIST")" == "$BUNDLE_ID" ]] \
  || fail "legacy retirement plist must remain associated with $BUNDLE_ID"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :BundleProgram' "$LEGACY_LAUNCH_AGENT_PLIST")" == "Contents/MacOS/IntentiveLoginLauncher" ]] \
  || fail "legacy retirement plist must never restore the sensing executable"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:0' "$LEGACY_LAUNCH_AGENT_PLIST")" == "Contents/MacOS/IntentiveLoginLauncher" ]] \
  || fail "legacy retirement plist must resolve the one-shot login launcher"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :RunAtLoad' "$LEGACY_LAUNCH_AGENT_PLIST")" == "false" ]] \
  || fail "legacy retirement plist must be non-starting"
assert_optional_plist "IntentiveControlPlaneURL" "$CONTROL_PLANE_URL"
assert_optional_plist "IntentiveHostedAuthURL" "$HOSTED_AUTH_URL"
assert_optional_plist "IntentiveAuthTokenExchangeURL" "$AUTH_TOKEN_EXCHANGE_URL"
assert_optional_plist "SUFeedURL" "$SPARKLE_FEED_URL"
assert_optional_plist "SUPublicEDKey" "$SPARKLE_PUBLIC_ED_KEY"
if [[ -n "$SPARKLE_PUBLIC_ED_KEY" ]]; then
  assert_eq "SUEnableAutomaticChecks" "true"
  assert_eq "SUAutomaticallyUpdate" "false"
  assert_eq "SUScheduledCheckInterval" "3600"
else
  assert_optional_plist "SUEnableAutomaticChecks" ""
  assert_optional_plist "SUAutomaticallyUpdate" ""
  assert_optional_plist "SUScheduledCheckInterval" ""
fi
assert_optional_plist "IntentiveSentryDSN" "$SENTRY_DSN"
assert_optional_plist "IntentivePostHogProjectKey" "$POSTHOG_PROJECT_KEY"
if [[ -n "$POSTHOG_PROJECT_KEY" ]]; then
  assert_eq "IntentivePostHogHost" "$POSTHOG_HOST"
else
  assert_optional_plist "IntentivePostHogHost" ""
fi

for endpoint_pair in \
  "IntentiveControlPlaneURL=$CONTROL_PLANE_URL" \
  "IntentiveHostedAuthURL=$HOSTED_AUTH_URL" \
  "IntentiveAuthTokenExchangeURL=$AUTH_TOKEN_EXCHANGE_URL"; do
  endpoint_key="${endpoint_pair%%=*}"
  endpoint="${endpoint_pair#*=}"
  if [[ -n "$endpoint" ]]; then
    "$PUBLIC_ENDPOINT_VERIFIER" "$endpoint_key" "$endpoint" \
      || fail "$endpoint_key failed public endpoint verification"
  fi
done

assert_nonempty_plist "NSScreenCaptureUsageDescription"
assert_nonempty_plist "NSAppleEventsUsageDescription"
assert_nonempty_plist "NSMicrophoneUsageDescription"
assert_nonempty_plist "NSAudioCaptureUsageDescription"

if plutil -p "$PLIST" | grep -Eq "com[.]omi|Omi|omi-computer"; then
  fail "Info.plist contains stale Omi identity"
fi

APP_SIGNING_DETAILS="$(codesign -dv --verbose=4 "$APP_BUNDLE" 2>&1 || true)"
APP_TEAM_ID="$(
  printf '%s\n' "$APP_SIGNING_DETAILS" \
    | awk -F= '/^TeamIdentifier=/{print $2; exit}'
)"
if [[ -n "$APP_TEAM_ID" && "$APP_TEAM_ID" != "not set" ]]; then
  codesign --verify --strict --verbose=2 "$LOGIN_LAUNCHER" >/dev/null 2>&1 \
    || fail "signed login launcher failed code-signature verification"

  LOGIN_LAUNCHER_SIGNING_DETAILS="$(
    codesign -dv --verbose=4 "$LOGIN_LAUNCHER" 2>&1 || true
  )"
  LOGIN_LAUNCHER_TEAM_ID="$(
    printf '%s\n' "$LOGIN_LAUNCHER_SIGNING_DETAILS" \
      | awk -F= '/^TeamIdentifier=/{print $2; exit}'
  )"
  [[ "$LOGIN_LAUNCHER_TEAM_ID" == "$APP_TEAM_ID" ]] \
    || fail "login launcher TeamIdentifier does not match the containing app"
  printf '%s\n' "$LOGIN_LAUNCHER_SIGNING_DETAILS" \
    | grep -q '^Runtime Version=' \
    || fail "signed login launcher is missing hardened runtime"

  if ! LOGIN_LAUNCHER_ENTITLEMENTS="$(
    codesign -d --entitlements :- "$LOGIN_LAUNCHER" 2>/dev/null
  )"; then
    fail "could not read signed login launcher entitlements"
  fi
  if printf '%s\n' "$LOGIN_LAUNCHER_ENTITLEMENTS" | grep -q '<key>'; then
    fail "login launcher must not carry entitlements, including capture entitlements"
  fi
fi

echo "Desktop bundle smoke passed: $APP_BUNDLE"
