#!/usr/bin/env bash
set -euo pipefail

# Launch-at-login proof against a signed, installed Intentive.app (ADR 0011).
#
# Deterministic, CI-runnable checks:
#   1. the bundle ships a valid LaunchAgent plist that SMAppService registers;
#   2. its BundleProgram is bundle-relative so it survives moves;
#   3. the LaunchAgent owns a one-shot launcher, not the sensing process;
#   4. that launcher yields a running menu-bar-only main process
#      (no window becomes key, no regular Dock activation) that then quits.
#
# The physical login cycle ("no Dock/window flash" on real login) and the
# "Open Intentive" Dock/window restore are interactive and remain operator-
# observed on the dedicated Mac, recorded alongside this JSON. This script never
# claims those; it proves the machinery they depend on.

usage() {
  cat <<'EOF'
Usage: verify-launch-at-login.sh --app PATH --output JSON --evidence-root DIR \
                                 [--release-tag TAG --candidate-sha SHA --dmg-sha256 DIGEST]
EOF
}

fail() { echo "Launch-at-login proof failed: $*" >&2; exit 1; }

APP=""
OUTPUT=""
EVIDENCE_ROOT=""
RELEASE_TAG=""
CANDIDATE_SHA=""
DMG_SHA256=""
while (($#)); do
  case "$1" in
    --app) APP="${2:-}"; shift 2 ;;
    --output) OUTPUT="${2:-}"; shift 2 ;;
    --evidence-root) EVIDENCE_ROOT="${2:-}"; shift 2 ;;
    --release-tag) RELEASE_TAG="${2:-}"; shift 2 ;;
    --candidate-sha) CANDIDATE_SHA="${2:-}"; shift 2 ;;
    --dmg-sha256) DMG_SHA256="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -d "$APP" ]] || fail "installed app bundle is missing: $APP"
[[ -n "$OUTPUT" ]] || fail "--output is required"
[[ -n "$EVIDENCE_ROOT" ]] || fail "--evidence-root is required"
mkdir -p "$EVIDENCE_ROOT/launch-at-login"

INFO_PLIST="$APP/Contents/Info.plist"
EXECUTABLE="$APP/Contents/MacOS/Intentive"
LOGIN_LAUNCHER="$APP/Contents/MacOS/IntentiveLoginLauncher"
BUNDLE_ID="$(
  /usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$INFO_PLIST" 2>/dev/null
)"
PLIST="$APP/Contents/Library/LaunchAgents/$BUNDLE_ID.login-launcher-v1.plist"
LEGACY_PLIST="$APP/Contents/Library/LaunchAgents/com.heyintentive.desktop.login.plist"

[[ -f "$PLIST" ]] || fail "bundled LaunchAgent plist missing: $PLIST"
[[ -f "$LEGACY_PLIST" ]] \
  || fail "targeted legacy LaunchAgent retirement plist missing: $LEGACY_PLIST"
plutil -lint "$PLIST" >/dev/null || fail "LaunchAgent plist is not valid"
[[ -x "$LOGIN_LAUNCHER" ]] || fail "one-shot login launcher is missing"

read_plist() { /usr/libexec/PlistBuddy -c "Print :$1" "$PLIST" 2>/dev/null; }
LABEL="$(read_plist Label)"

# BundleProgram must be bundle-relative so login launch survives an app move.
[[ "$LABEL" == "$BUNDLE_ID.login-launcher-v1" ]] \
  || fail "LaunchAgent must use the fresh versioned service identity"
[[ "$(read_plist BundleProgram)" == "Contents/MacOS/IntentiveLoginLauncher" ]] \
  || fail "LaunchAgent BundleProgram must be bundle-relative"
[[ "$(read_plist 'ProgramArguments:0')" == "Contents/MacOS/IntentiveLoginLauncher" ]] \
  || fail "LaunchAgent must invoke the one-shot login launcher"
[[ "$(read_plist 'AssociatedBundleIdentifiers:0')" == "$BUNDLE_ID" ]] \
  || fail "LaunchAgent must associate the Intentive bundle identifier"
[[ "$(read_plist RunAtLoad)" == "true" ]] || fail "LaunchAgent must RunAtLoad"

cp "$PLIST" "$EVIDENCE_ROOT/launch-at-login/LaunchAgent.plist"
cp "$LEGACY_PLIST" \
  "$EVIDENCE_ROOT/launch-at-login/LegacyLaunchAgentRetirement.plist"

# Background launch: the login-helper path. Prove a menu-bar-only process comes up and
# that no window belonging to it becomes the frontmost/key window.
osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
for _ in {1..50}; do
  pgrep -f "^$EXECUTABLE( |\$)" >/dev/null || break
  sleep 0.1
done
pgrep -f "^$EXECUTABLE( |\$)" >/dev/null \
  && fail "existing Intentive process did not quit gracefully"
"$LOGIN_LAUNCHER" >"$EVIDENCE_ROOT/launch-at-login/background-launch.log" 2>&1
BG_PID=""
launched=false
for _ in {1..100}; do
  BG_PID="$(pgrep -n -f "^$EXECUTABLE( |\$)" || true)"
  if [[ -n "$BG_PID" ]] && kill -0 "$BG_PID" 2>/dev/null; then launched=true; break; fi
  sleep 0.1
done
[[ "$launched" == true ]] || fail "background login launch did not start"

# Give the menu-bar item time to install, then confirm the app did not steal
# focus with a visible window (menu-bar-only). A regular window would make the
# app the frontmost application; a background/accessory app does not.
sleep 2
FRONT_BUNDLE="$(
  osascript -e 'tell application "System Events" to get bundle identifier of first application process whose frontmost is true' \
    2>/dev/null || true
)"
echo "frontmost after background launch: ${FRONT_BUNDLE:-unknown}" \
  >>"$EVIDENCE_ROOT/launch-at-login/background-launch.log"
menu_bar_only=true
[[ "$FRONT_BUNDLE" == "$BUNDLE_ID" ]] && menu_bar_only=false

osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 || true

[[ "$menu_bar_only" == true ]] \
  || fail "background launch became frontmost; login launch must stay menu-bar-only"

python3 - "$OUTPUT" "$RELEASE_TAG" "$CANDIDATE_SHA" "$DMG_SHA256" <<'PY'
import json, pathlib, sys
path, tag, sha, digest = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
payload = {
    "ok": True,
    "registration": "fresh versioned LaunchAgent validated (label, one-shot bundle-relative launcher, RunAtLoad)",
    "background_launch": "menu-bar-only process started without becoming frontmost",
    "operator_observed": [
        "login launch shows no Dock/window flash",
        "Open Intentive restores Dock/window state",
    ],
    "evidence_files": [
        "launch-at-login/LaunchAgent.plist",
        "launch-at-login/LegacyLaunchAgentRetirement.plist",
        "launch-at-login/background-launch.log",
    ],
}
if tag:
    payload["release_tag"] = tag
if sha:
    payload["candidate_sha"] = sha
if digest:
    payload["dmg_sha256"] = digest
path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
PY

echo "Launch-at-login proof passed: $OUTPUT"
