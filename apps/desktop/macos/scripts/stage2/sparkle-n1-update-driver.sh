#!/usr/bin/env bash
set -euo pipefail

# Stage 2 driver for DESKTOP_STAGE2_SPARKLE_DRIVER (apps/desktop/docs/RELEASE.md).
#
# Proves the first-native-release Sparkle path end to end. It privately builds
# the accepted source as native 0.1.0 with a lower build number, signs and
# notarizes that baseline, then updates it to the exact 0.1.1 candidate through
# the candidate's real appcast served over loopback.
#
# Usage: sparkle-n1-update-driver.sh --candidate-dmg PATH --appcast PATH \
#   --release-tag TAG --candidate-sha SHA --dmg-sha256 DIGEST \
#   --output JSON --evidence-root DIR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/write-proof.sh"
source "$SCRIPT_DIR/lib/compile-ax-probe.sh"
fail() { echo "Sparkle N-1 update proof failed: $*" >&2; exit 1; }

CANDIDATE_DMG=""
APPCAST=""
RELEASE_TAG=""
CANDIDATE_SHA=""
DMG_SHA256=""
OUTPUT=""
EVIDENCE_ROOT=""
while (($#)); do
  case "$1" in
    --candidate-dmg) CANDIDATE_DMG="${2:-}"; shift 2 ;;
    --appcast) APPCAST="${2:-}"; shift 2 ;;
    --release-tag) RELEASE_TAG="${2:-}"; shift 2 ;;
    --candidate-sha) CANDIDATE_SHA="${2:-}"; shift 2 ;;
    --dmg-sha256) DMG_SHA256="${2:-}"; shift 2 ;;
    --output) OUTPUT="${2:-}"; shift 2 ;;
    --evidence-root) EVIDENCE_ROOT="${2:-}"; shift 2 ;;
    -h|--help) echo "Usage: $0 --candidate-dmg P --appcast P --release-tag T --candidate-sha S --dmg-sha256 D --output J --evidence-root DIR"; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -f "$CANDIDATE_DMG" ]] || fail "--candidate-dmg is missing"
[[ -f "$APPCAST" ]] || fail "--appcast is missing"
# Matches desktop-release-acceptance.yml's own tag validation exactly. This is
# interpolated into a jq query string below, so it must be tightly shaped, not
# just prefix-checked.
[[ "$RELEASE_TAG" =~ ^desktop-v[0-9]+\.[0-9]+\.[0-9]+([+][0-9]+)?$ ]] || fail "invalid --release-tag"
[[ -n "$CANDIDATE_SHA" ]] || fail "--candidate-sha is required"
[[ -n "$DMG_SHA256" ]] || fail "--dmg-sha256 is required"
[[ -n "$OUTPUT" ]] || fail "--output is required"
[[ -n "$EVIDENCE_ROOT" ]] || fail "--evidence-root is required"
[[ "$(git -C "$SCRIPT_DIR/../../../../../" rev-parse HEAD)" == "$CANDIDATE_SHA" ]] \
  || fail "the checked-out source is not the accepted candidate SHA"
SIGNING_IDENTITY="${DESKTOP_STAGE2_SIGNING_IDENTITY:-${SIGNING_IDENTITY:-}}"
NOTARY_PROFILE="${DESKTOP_STAGE2_NOTARY_PROFILE:-}"
[[ -n "$SIGNING_IDENTITY" ]] || fail "DESKTOP_STAGE2_SIGNING_IDENTITY is required"
[[ -n "$NOTARY_PROFILE" ]] || fail "DESKTOP_STAGE2_NOTARY_PROFILE is required"

EVIDENCE_DIR="$EVIDENCE_ROOT/sparkle-update"
rm -rf "$EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR"

INSTALLED_APP="/Applications/Intentive.app"
[[ -d "$INSTALLED_APP" ]] || fail "candidate is not installed at $INSTALLED_APP (run-stage2-release-proof.sh installs it first)"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/intentive-sparkle-proof.XXXXXX")"
FEED_PORT=$((49152 + RANDOM % 12000))
FEED_PID=""
PROBE_PID=""
BACKUP_APP=""
MOUNT_POINT=""

cleanup() {
  [[ -n "$FEED_PID" ]] && kill "$FEED_PID" >/dev/null 2>&1 || true
  [[ -n "$PROBE_PID" ]] && kill "$PROBE_PID" >/dev/null 2>&1 || true
  pkill -f '^/Applications/Intentive.app/Contents/MacOS/Intentive( |$)' >/dev/null 2>&1 || true
  if [[ -n "$MOUNT_POINT" ]]; then
    hdiutil detach "$MOUNT_POINT" -quiet >/dev/null 2>&1 || true
  fi
  if [[ -n "$BACKUP_APP" && -d "$BACKUP_APP" ]]; then
    rm -rf "$INSTALLED_APP"
    mv "$BACKUP_APP" "$INSTALLED_APP"
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

read_build_number() {
  /usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$1/Contents/Info.plist"
}

write_app_manifest() {
  local app="$1" output="$2"
  python3 - "$app" "$output" <<'PY'
import hashlib
import os
import pathlib
import stat
import sys

root = pathlib.Path(sys.argv[1]).resolve()
output = pathlib.Path(sys.argv[2])
entries = []
for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
    relative = path.relative_to(root).as_posix()
    metadata = path.lstat()
    mode = stat.S_IMODE(metadata.st_mode)
    if path.is_symlink():
        entries.append(f"L {mode:04o} {relative}\t{os.readlink(path)}")
    elif path.is_dir():
        entries.append(f"D {mode:04o} {relative}")
    elif path.is_file():
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        entries.append(f"F {mode:04o} {metadata.st_size} {digest} {relative}")
    else:
        raise SystemExit(f"unsupported app-bundle entry: {relative}")
output.write_text("\n".join(entries) + "\n")
PY
}

CANDIDATE_BUILD="$(read_build_number "$INSTALLED_APP")"
[[ "$CANDIDATE_BUILD" =~ ^[0-9]+$ && "$CANDIDATE_BUILD" -gt 1 ]] \
  || fail "candidate build must be numeric and greater than 1"
BASELINE_BUILD=$((CANDIDATE_BUILD - 1))
BASELINE_VERSION="0.1.0"
SPARKLE_PUBLIC_ED_KEY="$(
  /usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$INSTALLED_APP/Contents/Info.plist"
)"
[[ -n "$SPARKLE_PUBLIC_ED_KEY" ]] || fail "candidate has no Sparkle public key"
BASELINE_CONTROL_PLANE_URL="$(
  /usr/libexec/PlistBuddy -c 'Print :IntentiveControlPlaneURL' \
    "$INSTALLED_APP/Contents/Info.plist"
)"
BASELINE_HOSTED_AUTH_URL="$(
  /usr/libexec/PlistBuddy -c 'Print :IntentiveHostedAuthURL' \
    "$INSTALLED_APP/Contents/Info.plist"
)"
BASELINE_AUTH_TOKEN_EXCHANGE_URL="$(
  /usr/libexec/PlistBuddy -c 'Print :IntentiveAuthTokenExchangeURL' \
    "$INSTALLED_APP/Contents/Info.plist" 2>/dev/null || true
)"
[[ -n "$BASELINE_CONTROL_PLANE_URL" && -n "$BASELINE_HOSTED_AUTH_URL" ]] \
  || fail "candidate has no audited service endpoints for the N-1 baseline"
codesign -dv --verbose=4 "$INSTALLED_APP" 2>"$EVIDENCE_DIR/candidate-before.txt" || true

# Build the reference manifest from the app inside the exact candidate DMG,
# not from a prior build directory or the already-installed convenience copy.
MOUNT_POINT="$(mktemp -d "${TMPDIR:-/tmp}/intentive-candidate-manifest.XXXXXX")"
hdiutil attach "$CANDIDATE_DMG" -nobrowse -readonly -mountpoint "$MOUNT_POINT" -quiet
CANDIDATE_DMG_APP="$(find "$MOUNT_POINT" -maxdepth 2 -name '*.app' -type d -print -quit)"
[[ -d "$CANDIDATE_DMG_APP" ]] || fail "candidate DMG contains no app bundle"
write_app_manifest "$CANDIDATE_DMG_APP" "$EVIDENCE_DIR/candidate-dmg-app.manifest"
CANDIDATE_CONTENT_SHA256="$(
  shasum -a 256 "$EVIDENCE_DIR/candidate-dmg-app.manifest" | awk '{print $1}'
)"
hdiutil detach "$MOUNT_POINT" -quiet
MOUNT_POINT=""
printf '%s\n' "$CANDIDATE_CONTENT_SHA256" \
  >"$EVIDENCE_DIR/candidate-dmg-app.manifest.sha256"

REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../../" && pwd)"
BASELINE_ROOT="$WORK_DIR/baseline-dmg-root"
BASELINE_DMG="$WORK_DIR/Intentive-$BASELINE_VERSION.dmg"
BASELINE_APP="$(
  CONFIGURATION=release \
  INTENTIVE_APP_NAME=Intentive \
  INTENTIVE_BUNDLE_ID=com.heyintentive.desktop \
  INTENTIVE_APP_VERSION="$BASELINE_VERSION" \
  INTENTIVE_APP_BUILD="$BASELINE_BUILD" \
  INTENTIVE_AUTH_CALLBACK_SCHEME=intentive-desktop \
  INTENTIVE_CONTROL_PLANE_URL="$BASELINE_CONTROL_PLANE_URL" \
  INTENTIVE_HOSTED_AUTH_URL="$BASELINE_HOSTED_AUTH_URL" \
  INTENTIVE_AUTH_TOKEN_EXCHANGE_URL="$BASELINE_AUTH_TOKEN_EXCHANGE_URL" \
  INTENTIVE_SPARKLE_FEED_URL="http://127.0.0.1:$FEED_PORT/appcast.xml" \
  INTENTIVE_SPARKLE_PUBLIC_ED_KEY="$SPARKLE_PUBLIC_ED_KEY" \
    "$REPO_ROOT/apps/desktop/macos/scripts/build-app-bundle.sh" \
      2>"$EVIDENCE_DIR/baseline-build.log" | tail -n 1
)"
[[ -d "$BASELINE_APP" ]] || fail "native $BASELINE_VERSION baseline build did not produce an app"
for framework in \
  "$BASELINE_APP/Contents/Frameworks/Sparkle.framework" \
  "$BASELINE_APP/Contents/Frameworks/Sentry.framework"; do
  codesign --force --options runtime --timestamp --deep --sign "$SIGNING_IDENTITY" "$framework"
done
codesign --force --options runtime --timestamp --deep \
  --entitlements "$REPO_ROOT/apps/desktop/macos/Desktop/Intentive-Release.entitlements" \
  --sign "$SIGNING_IDENTITY" "$BASELINE_APP"
codesign --verify --deep --strict --verbose=2 "$BASELINE_APP"
mkdir -p "$BASELINE_ROOT"
ditto "$BASELINE_APP" "$BASELINE_ROOT/Intentive.app"
ln -s /Applications "$BASELINE_ROOT/Applications"
hdiutil create -volname Intentive -srcfolder "$BASELINE_ROOT" -ov -format UDZO "$BASELINE_DMG" \
  >"$EVIDENCE_DIR/baseline-dmg-build.log"
codesign --force --timestamp --sign "$SIGNING_IDENTITY" "$BASELINE_DMG"
xcrun notarytool submit "$BASELINE_DMG" --keychain-profile "$NOTARY_PROFILE" --wait \
  >"$EVIDENCE_DIR/baseline-notarization.txt"
xcrun stapler staple "$BASELINE_DMG" >>"$EVIDENCE_DIR/baseline-notarization.txt"
xcrun stapler validate "$BASELINE_DMG" >>"$EVIDENCE_DIR/baseline-notarization.txt"
printf 'version=%s\nbuild=%s\nsource_sha=%s\n' \
  "$BASELINE_VERSION" "$BASELINE_BUILD" "$CANDIDATE_SHA" \
  >"$EVIDENCE_DIR/baseline-identity.txt"

# Serve a loopback copy of the candidate's real appcast with its enclosure URL
# rewritten to the local DMG copy — the draft release's real asset URL requires
# GitHub auth an anonymous Sparkle client does not have.
FEED_DIR="$WORK_DIR/feed"
mkdir -p "$FEED_DIR"
cp "$CANDIDATE_DMG" "$FEED_DIR/$(basename "$CANDIDATE_DMG")"
python3 - "$APPCAST" "$FEED_DIR/appcast.xml" "http://127.0.0.1:$FEED_PORT/$(basename "$CANDIDATE_DMG")" <<'PY'
import sys
import xml.etree.ElementTree as ET

src, dest, loopback_url = sys.argv[1:4]
ns = "http://www.andymatuschak.org/xml-namespaces/sparkle"
ET.register_namespace("sparkle", ns)
tree = ET.parse(src)
item = tree.getroot().find("./channel/item")
if item is None:
    raise SystemExit("candidate appcast has no item")
enclosure = item.find("enclosure")
if enclosure is None:
    raise SystemExit("candidate appcast item has no enclosure")
enclosure.set("url", loopback_url)
tree.write(dest, xml_declaration=True, encoding="UTF-8")
PY

python3 -m http.server "$FEED_PORT" --bind 127.0.0.1 --directory "$FEED_DIR" \
  >"$EVIDENCE_DIR/loopback-feed.log" 2>&1 &
FEED_PID=$!
for _ in {1..100}; do
  curl --fail --silent "http://127.0.0.1:$FEED_PORT/appcast.xml" >/dev/null && break
  kill -0 "$FEED_PID" >/dev/null 2>&1 || fail "loopback appcast server failed to start"
  sleep 0.05
done
cp "$FEED_DIR/appcast.xml" "$EVIDENCE_DIR/served-appcast.xml"

# Swap the candidate out for the privately built native baseline.
BACKUP_APP="$WORK_DIR/Intentive.candidate.app"
mv "$INSTALLED_APP" "$BACKUP_APP"
MOUNT_POINT="$(mktemp -d "${TMPDIR:-/tmp}/intentive-n1-mount.XXXXXX")"
hdiutil attach "$BASELINE_DMG" -nobrowse -readonly -mountpoint "$MOUNT_POINT" -quiet
BASELINE_APP_SOURCE="$(find "$MOUNT_POINT" -maxdepth 2 -name '*.app' -type d -print -quit)"
[[ -d "$BASELINE_APP_SOURCE" ]] || fail "baseline DMG contains no app bundle"
ditto "$BASELINE_APP_SOURCE" "$INSTALLED_APP"
hdiutil detach "$MOUNT_POINT" -quiet
MOUNT_POINT=""
codesign --verify --deep --strict --verbose=2 "$INSTALLED_APP"
N1_BUILD="$(read_build_number "$INSTALLED_APP")"
[[ "$N1_BUILD" == "$BASELINE_BUILD" ]] || fail "installed baseline build is not $BASELINE_BUILD"
codesign -dv --verbose=4 "$INSTALLED_APP" 2>"$EVIDENCE_DIR/n1-before-update.txt"

INTENTIVE_RELEASE_ACCEPTANCE=1 \
  INTENTIVE_RELEASE_ACCEPTANCE_FEED_URL="http://127.0.0.1:$FEED_PORT/appcast.xml" \
  open -n -F "$INSTALLED_APP" \
  --stdout "$EVIDENCE_DIR/n1-app.log" --stderr "$EVIDENCE_DIR/n1-app.log"

APP_PID=""
for _ in {1..100}; do
  APP_PID="$(pgrep -n -f '^/Applications/Intentive.app/Contents/MacOS/Intentive( |$)' || true)"
  [[ -n "$APP_PID" ]] && break
  sleep 0.1
done
[[ -n "$APP_PID" ]] || fail "native $BASELINE_VERSION baseline did not launch"

PROBE_BIN="$WORK_DIR/SparkleUpdateProbe"
compile_ax_probe "$SCRIPT_DIR/SparkleUpdateProbe.swift" "$PROBE_BIN" "$WORK_DIR/sparkle-probe"
"$PROBE_BIN" "$APP_PID" >"$EVIDENCE_DIR/update-probe.log" 2>&1 &
PROBE_PID=$!
wait "$PROBE_PID"
PROBE_PID=""

# Sparkle installs on relaunch/quit (SPUUpdaterDelegate.willInstallUpdateOnQuit
# defers to the app's own quit path). Quit N-1 to trigger the deferred install:
# a polite quit gives Sparkle's install-on-quit hook a chance to hand off to
# its separate relauncher helper before the process exits; only force-kill as
# a fallback once it's had time to do that.
osascript -e 'tell application id "com.heyintentive.desktop" to quit' >/dev/null 2>&1 || true
for _ in {1..40}; do
  kill -0 "$APP_PID" >/dev/null 2>&1 || break
  sleep 0.5
done
kill "$APP_PID" >/dev/null 2>&1 || true

UPDATED_BUILD=""
for _ in {1..300}; do
  if [[ -d "$INSTALLED_APP" ]]; then
    candidate_build="$(read_build_number "$INSTALLED_APP" 2>/dev/null || true)"
    if [[ "$candidate_build" == "$CANDIDATE_BUILD" ]]; then
      UPDATED_BUILD="$candidate_build"
      break
    fi
  fi
  sleep 0.5
done
[[ "$UPDATED_BUILD" == "$CANDIDATE_BUILD" ]] \
  || fail "installed build is ${UPDATED_BUILD:-missing}, expected candidate build $CANDIDATE_BUILD"
codesign --verify --deep --strict --verbose=2 "$INSTALLED_APP"
codesign -dv --verbose=4 "$INSTALLED_APP" 2>"$EVIDENCE_DIR/candidate-after-update.txt"
write_app_manifest "$INSTALLED_APP" "$EVIDENCE_DIR/installed-after-update.manifest"
INSTALLED_CONTENT_SHA256="$(
  shasum -a 256 "$EVIDENCE_DIR/installed-after-update.manifest" | awk '{print $1}'
)"
printf '%s\n' "$INSTALLED_CONTENT_SHA256" \
  >"$EVIDENCE_DIR/installed-after-update.manifest.sha256"
cmp -s \
  "$EVIDENCE_DIR/candidate-dmg-app.manifest" \
  "$EVIDENCE_DIR/installed-after-update.manifest" \
  || fail "Sparkle-installed app content does not match the exact candidate DMG"
[[ "$INSTALLED_CONTENT_SHA256" == "$CANDIDATE_CONTENT_SHA256" ]] \
  || fail "Sparkle-installed app manifest digest does not match the candidate DMG"
pkill -f '^/Applications/Intentive.app/Contents/MacOS/Intentive( |$)' >/dev/null 2>&1 || true

# The update landed correctly in place; drop the pre-swap backup so cleanup's
# trap doesn't overwrite the freshly-updated candidate with the old copy.
rm -rf "$BACKUP_APP"
BACKUP_APP=""

EXTRA_JSON="$(python3 -c 'import json,sys; print(json.dumps({"baseline_version": sys.argv[1], "baseline_build": sys.argv[2], "baseline_source_sha": sys.argv[3], "installed_build_after_update": sys.argv[4], "candidate_content_sha256": sys.argv[5], "installed_content_sha256": sys.argv[6]}))' "$BASELINE_VERSION" "$N1_BUILD" "$CANDIDATE_SHA" "$CANDIDATE_BUILD" "$CANDIDATE_CONTENT_SHA256" "$INSTALLED_CONTENT_SHA256")"
write_proof_json "$OUTPUT" "$RELEASE_TAG" "$CANDIDATE_SHA" "$DMG_SHA256" "$EXTRA_JSON" \
  "sparkle-update/baseline-identity.txt" \
  "sparkle-update/baseline-build.log" \
  "sparkle-update/baseline-notarization.txt" \
  "sparkle-update/served-appcast.xml" \
  "sparkle-update/n1-before-update.txt" \
  "sparkle-update/update-probe.log" \
  "sparkle-update/candidate-after-update.txt" \
  "sparkle-update/candidate-dmg-app.manifest" \
  "sparkle-update/candidate-dmg-app.manifest.sha256" \
  "sparkle-update/installed-after-update.manifest" \
  "sparkle-update/installed-after-update.manifest.sha256"

echo "Sparkle N-1 update proof passed: $OUTPUT"
