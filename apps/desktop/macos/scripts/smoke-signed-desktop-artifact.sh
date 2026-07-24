#!/usr/bin/env bash
set -euo pipefail
export PATH="/bin:/usr/bin:/usr/sbin:/sbin"

APP_BUNDLE=""
DMG_PATH=""
APPCAST_PATH=""
RELEASE_TAG=""
EXPECTED_BUILD=""
EXPECTED_TEAM_ID="${INTENTIVE_SIGNED_ARTIFACT_SMOKE_TEAM_ID:-}"
SPARKLE_SIGN_TOOL=""
SPARKLE_PRIVATE_KEY_FILE=""
RESULT_JSON=""
RUN_LAUNCH=false
KEEP_INSTALL=false
INSTALL_DIR=""
DMG_MOUNTPOINT=""
SMOKE_PID=""
SMOKE_CHECKS=()
SMOKE_ARTIFACTS=()

usage() {
  cat <<'USAGE'
Usage: scripts/smoke-signed-desktop-artifact.sh --app /path/to/Intentive.app [options]

Adapts Omi's signed desktop artifact smoke for Intentive's public release
boundary. The deterministic path audits the exact app, DMG, and appcast before
publication; the optional launch path is reserved for an isolated release Mac.

Options:
  --app PATH                    Signed Intentive.app bundle (required)
  --dmg PATH                    Signed, notarized, stapled install DMG
  --appcast PATH                Sparkle appcast for the exact DMG
  --tag TAG                     Expected tag, desktop-vX.Y.Z or desktop-vX.Y.Z+BUILD
  --build BUILD                 Expected numeric CFBundleVersion
  --expected-team-id TEAM       Expected Apple Developer Team ID
  --sparkle-sign-tool PATH      Sparkle sign_update executable
  --sparkle-private-key PATH    Private EdDSA key file used only to verify the DMG signature
  --launch                      Install-copy and launch the signed app briefly
  --install-dir PATH            Isolated directory used by --launch
  --keep-install                Preserve the isolated launch copy
  --result-json PATH            Write digest-matched machine-readable evidence
  -h, --help                    Show this help

Public smoke paths covered:
  - Launch + identity metadata
  - Developer ID signing, hardened runtime, Gatekeeper, and Apple Silicon
  - Sparkle/update metadata and cryptographic DMG signature
  - DMG install artifact, notarization ticket, and embedded-app alignment
  - Native framework integrity
  - Local Screen Memory assets and privacy metadata

The script never publishes artifacts. A public release invocation supplies all
three artifacts, the expected tag/build/team, and Sparkle verification inputs.
USAGE
}

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
  SMOKE_CHECKS+=("$*")
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

require_option_value() {
  local option="$1"
  local value="${2:-}"
  [[ -n "$value" && "$value" != -* ]] || fail "$option requires a value"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --app) require_option_value "$1" "${2:-}"; APP_BUNDLE="$2"; shift 2 ;;
      --dmg) require_option_value "$1" "${2:-}"; DMG_PATH="$2"; shift 2 ;;
      --appcast) require_option_value "$1" "${2:-}"; APPCAST_PATH="$2"; shift 2 ;;
      --tag) require_option_value "$1" "${2:-}"; RELEASE_TAG="$2"; shift 2 ;;
      --build) require_option_value "$1" "${2:-}"; EXPECTED_BUILD="$2"; shift 2 ;;
      --expected-team-id) require_option_value "$1" "${2:-}"; EXPECTED_TEAM_ID="$2"; shift 2 ;;
      --sparkle-sign-tool) require_option_value "$1" "${2:-}"; SPARKLE_SIGN_TOOL="$2"; shift 2 ;;
      --sparkle-private-key) require_option_value "$1" "${2:-}"; SPARKLE_PRIVATE_KEY_FILE="$2"; shift 2 ;;
      --launch) RUN_LAUNCH=true; shift ;;
      --install-dir) require_option_value "$1" "${2:-}"; INSTALL_DIR="$2"; shift 2 ;;
      --keep-install) KEEP_INSTALL=true; shift ;;
      --result-json) require_option_value "$1" "${2:-}"; RESULT_JSON="$2"; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) fail "unknown argument: $1" ;;
    esac
  done
}

version_from_tag() {
  [[ "$1" =~ ^desktop-v([0-9]+[.][0-9]+[.][0-9]+)([+]([0-9]+))?$ ]] || return 1
  printf '%s\n' "${BASH_REMATCH[1]}"
}

build_from_tag() {
  [[ "$1" =~ ^desktop-v([0-9]+[.][0-9]+[.][0-9]+)([+]([0-9]+))?$ ]] || return 1
  printf '%s\n' "${BASH_REMATCH[3]:-}"
}

plist_read() {
  /usr/libexec/PlistBuddy -c "Print :$1" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || true
}

plist_read_from() {
  local bundle="$1"
  local key="$2"
  /usr/libexec/PlistBuddy -c "Print :$key" "$bundle/Contents/Info.plist" 2>/dev/null || true
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

cleanup() {
  if [[ -n "$SMOKE_PID" ]] && kill -0 "$SMOKE_PID" >/dev/null 2>&1; then
    kill "$SMOKE_PID" >/dev/null 2>&1 || true
    wait "$SMOKE_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$DMG_MOUNTPOINT" && -d "$DMG_MOUNTPOINT" ]]; then
    hdiutil detach "$DMG_MOUNTPOINT" -quiet >/dev/null 2>&1 || true
    rmdir "$DMG_MOUNTPOINT" >/dev/null 2>&1 || true
  fi
  if [[ "$KEEP_INSTALL" != true && -n "$INSTALL_DIR" && "$INSTALL_DIR" == "${TMPDIR:-/tmp}"/intentive-signed-smoke-install.* ]]; then
    rm -rf "$INSTALL_DIR"
  fi
}
trap cleanup EXIT

validate_release_expectations() {
  [[ -n "$APP_BUNDLE" ]] || fail "--app is required"
  [[ -d "$APP_BUNDLE/Contents" ]] || fail "app bundle not found: $APP_BUNDLE"
  APP_BUNDLE="$(cd "$APP_BUNDLE" && pwd)"

  if [[ -n "$RELEASE_TAG" ]]; then
    local tag_version tag_build
    tag_version="$(version_from_tag "$RELEASE_TAG")" || fail "invalid release tag: $RELEASE_TAG"
    tag_build="$(build_from_tag "$RELEASE_TAG")"
    if [[ -n "$tag_build" ]]; then
      if [[ -n "$EXPECTED_BUILD" && "$EXPECTED_BUILD" != "$tag_build" ]]; then
        fail "--build $EXPECTED_BUILD disagrees with tag build $tag_build"
      fi
      EXPECTED_BUILD="$tag_build"
    fi
  fi
}

assert_bundle_identity() {
  local bundle_id version build executable minimum_system url_scheme feed_url public_key
  bundle_id="$(plist_read CFBundleIdentifier)"
  version="$(plist_read CFBundleShortVersionString)"
  build="$(plist_read CFBundleVersion)"
  executable="$(plist_read CFBundleExecutable)"
  minimum_system="$(plist_read LSMinimumSystemVersion)"
  url_scheme="$(plist_read CFBundleURLTypes:0:CFBundleURLSchemes:0)"
  feed_url="$(plist_read SUFeedURL)"
  public_key="$(plist_read SUPublicEDKey)"

  [[ "$bundle_id" == "com.heyintentive.desktop" ]] || fail "bundle id must be com.heyintentive.desktop, got ${bundle_id:-missing}"
  [[ "$minimum_system" == "14.0" ]] || fail "minimum macOS version must be 14.0, got ${minimum_system:-missing}"
  [[ "$url_scheme" == "intentive-desktop" ]] || fail "URL scheme must be intentive-desktop, got ${url_scheme:-missing}"
  [[ "$feed_url" == https://* ]] || fail "SUFeedURL must be HTTPS, got ${feed_url:-missing}"
  [[ "$feed_url" != *localhost* && "$feed_url" != *127.0.0.1* ]] || fail "SUFeedURL contains a local endpoint"
  [[ -n "$public_key" ]] || fail "SUPublicEDKey is missing"
  [[ -n "$executable" && -x "$APP_BUNDLE/Contents/MacOS/$executable" ]] || fail "main executable missing or not executable"

  if [[ -n "$RELEASE_TAG" ]]; then
    local expected_version
    expected_version="$(version_from_tag "$RELEASE_TAG")"
    [[ "$version" == "$expected_version" ]] || fail "version mismatch: expected $expected_version, got ${version:-missing}"
  fi
  if [[ -n "$EXPECTED_BUILD" ]]; then
    [[ "$EXPECTED_BUILD" =~ ^[0-9]+$ ]] || fail "expected build must be numeric: $EXPECTED_BUILD"
    [[ "$build" == "$EXPECTED_BUILD" ]] || fail "build mismatch: expected $EXPECTED_BUILD, got ${build:-missing}"
  fi

  for key in NSScreenCaptureUsageDescription NSMicrophoneUsageDescription NSAudioCaptureUsageDescription; do
    [[ -n "$(plist_read "$key")" ]] || fail "$key is missing"
  done
  [[ -n "$(plist_read IntentiveSentryDSN)" ]] || fail "IntentiveSentryDSN is missing"
  [[ -n "$(plist_read IntentivePostHogProjectKey)" ]] || fail "IntentivePostHogProjectKey is missing"

  if plutil -p "$APP_BUNDLE/Contents/Info.plist" | grep -Eq "com[.]omi|Omi|omi-computer"; then
    fail "Info.plist contains stale Omi identity"
  fi

  pass "Launch + identity metadata is aligned"
}

assert_signing_and_architecture() {
  require_cmd codesign
  require_cmd lipo
  [[ -n "$EXPECTED_TEAM_ID" ]] || fail "--expected-team-id is required for signed artifact acceptance"

  codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE" >/dev/null 2>&1 \
    || fail "app bundle failed deep codesign verification"

  local signing_details team runtime executable architectures entitlements
  signing_details="$(codesign -dv "$APP_BUNDLE" 2>&1 || true)"
  team="$(printf '%s\n' "$signing_details" | awk -F= '/^TeamIdentifier=/{print $2; exit}')"
  runtime="$(printf '%s\n' "$signing_details" | awk -F= '/^Runtime Version=/{print $2; exit}')"
  [[ "$team" == "$EXPECTED_TEAM_ID" ]] || fail "TeamIdentifier mismatch: expected $EXPECTED_TEAM_ID, got ${team:-missing}"
  [[ -n "$runtime" ]] || fail "signed app is missing hardened runtime metadata"

  entitlements="$(mktemp "${TMPDIR:-/tmp}/intentive-entitlements.XXXXXX.plist")"
  codesign -d --entitlements :- "$APP_BUNDLE" >"$entitlements" 2>/dev/null \
    || fail "could not read app entitlements"
  if /usr/libexec/PlistBuddy -c "Print :com.apple.security.get-task-allow" "$entitlements" >/dev/null 2>&1; then
    rm -f "$entitlements"
    fail "release app contains get-task-allow entitlement"
  fi
  rm -f "$entitlements"

  executable="$APP_BUNDLE/Contents/MacOS/$(plist_read CFBundleExecutable)"
  architectures="$(lipo -archs "$executable")"
  [[ " $architectures " == *" arm64 "* ]] || fail "release executable is missing arm64: $architectures"
  [[ " $architectures " != *" x86_64 "* ]] || fail "public v1 release must not include x86_64: $architectures"

  spctl --assess --type execute --verbose "$APP_BUNDLE" >/dev/null 2>&1 \
    || fail "spctl Gatekeeper assessment failed"

  pass "Developer ID signing, hardened runtime, Gatekeeper, and Apple Silicon passed"
}

assert_native_boundaries() {
  local resources="$APP_BUNDLE/Contents/Resources"
  [[ -d "$APP_BUNDLE/Contents/Frameworks/Sparkle.framework" ]] || fail "Sparkle.framework missing"
  [[ -d "$APP_BUNDLE/Contents/Frameworks/Sentry.framework" ]] || fail "Sentry.framework missing"
  [[ -s "$resources/AppIcon.icns" ]] || fail "AppIcon.icns missing"
  [[ -s "$resources/IntentiveDesktop_Intentive.bundle/IntentiveMenuBarIcon.png" ]] || fail "Intentive menu-bar icon missing"
  [[ -s "$resources/IntentiveDesktop_IntentiveDesktopNativeAdapters.bundle/silero_vad.onnx" ]] \
    || fail "local passive-audio VAD asset missing"
  pass "Native framework integrity passed"
  pass "Local Screen Memory assets and privacy metadata passed"
}

assert_bundle_matches() {
  local candidate="$1"
  local label="$2"
  local current_executable candidate_executable
  [[ "$(plist_read_from "$candidate" CFBundleIdentifier)" == "$(plist_read CFBundleIdentifier)" ]] \
    || fail "$label bundle id does not match source app"
  [[ "$(plist_read_from "$candidate" CFBundleShortVersionString)" == "$(plist_read CFBundleShortVersionString)" ]] \
    || fail "$label version does not match source app"
  [[ "$(plist_read_from "$candidate" CFBundleVersion)" == "$(plist_read CFBundleVersion)" ]] \
    || fail "$label build does not match source app"
  current_executable="$(plist_read CFBundleExecutable)"
  candidate_executable="$(plist_read_from "$candidate" CFBundleExecutable)"
  [[ "$candidate_executable" == "$current_executable" ]] || fail "$label executable name does not match source app"
  [[ "$(sha256_file "$candidate/Contents/MacOS/$candidate_executable")" == "$(sha256_file "$APP_BUNDLE/Contents/MacOS/$current_executable")" ]] \
    || fail "$label executable digest does not match source app"
}

record_artifact() {
  local label="$1"
  local path="$2"
  [[ -f "$path" ]] || return 0
  SMOKE_ARTIFACTS+=("$label|$path|$(stat -f '%z' "$path")|$(sha256_file "$path")")
}

assert_dmg() {
  [[ -n "$DMG_PATH" ]] || return 0
  [[ -f "$DMG_PATH" ]] || fail "DMG not found: $DMG_PATH"
  DMG_PATH="$(cd "$(dirname "$DMG_PATH")" && pwd)/$(basename "$DMG_PATH")"
  hdiutil imageinfo "$DMG_PATH" >/dev/null || fail "DMG imageinfo failed"
  codesign --verify --verbose=1 "$DMG_PATH" >/dev/null 2>&1 || fail "DMG codesign verification failed"
  xcrun stapler validate "$DMG_PATH" >/dev/null 2>&1 || fail "DMG notarization ticket validation failed"

  DMG_MOUNTPOINT="$(mktemp -d "${TMPDIR:-/tmp}/intentive-signed-smoke-dmg.XXXXXX")"
  hdiutil attach "$DMG_PATH" -nobrowse -readonly -mountpoint "$DMG_MOUNTPOINT" -quiet \
    || fail "DMG attach failed"
  local dmg_app
  dmg_app="$(find "$DMG_MOUNTPOINT" -maxdepth 2 -type d -name "Intentive.app" | head -1)"
  [[ -n "$dmg_app" ]] || fail "DMG does not contain Intentive.app"
  [[ -L "$DMG_MOUNTPOINT/Applications" ]] || fail "DMG is missing the Applications install link"
  [[ "$(readlink "$DMG_MOUNTPOINT/Applications")" == "/Applications" ]] \
    || fail "DMG Applications link does not target /Applications"
  assert_bundle_matches "$dmg_app" "DMG"
  record_artifact "dmg" "$DMG_PATH"
  pass "DMG install artifact, notarization ticket, and embedded app alignment passed"
}

appcast_field() {
  local field="$1"
  python3 - "$APPCAST_PATH" "$field" <<'PY'
import sys
import xml.etree.ElementTree as ET

path, field = sys.argv[1:]
root = ET.parse(path).getroot()
item = root.find("./channel/item")
if item is None:
    raise SystemExit("appcast has no item")
ns = "{http://www.andymatuschak.org/xml-namespaces/sparkle}"
enclosure = item.find("enclosure")
if enclosure is None:
    raise SystemExit("appcast item has no enclosure")
values = {
    "version": item.findtext(f"{ns}version") or enclosure.attrib.get(f"{ns}version", ""),
    "short_version": item.findtext(f"{ns}shortVersionString") or enclosure.attrib.get(f"{ns}shortVersionString", ""),
    "minimum_system": item.findtext(f"{ns}minimumSystemVersion") or enclosure.attrib.get(f"{ns}minimumSystemVersion", ""),
    "url": enclosure.attrib.get("url", ""),
    "length": enclosure.attrib.get("length", ""),
    "signature": enclosure.attrib.get(f"{ns}edSignature", ""),
}
print(values[field])
PY
}

assert_appcast() {
  [[ -n "$APPCAST_PATH" ]] || return 0
  [[ -n "$DMG_PATH" ]] || fail "--appcast requires --dmg"
  [[ -f "$APPCAST_PATH" ]] || fail "appcast not found: $APPCAST_PATH"
  plutil -lint "$APPCAST_PATH" >/dev/null 2>&1 || python3 -c 'import sys, xml.etree.ElementTree as E; E.parse(sys.argv[1])' "$APPCAST_PATH" \
    || fail "appcast is not valid XML"

  local version build minimum_system url length signature expected_url
  version="$(appcast_field short_version)"
  build="$(appcast_field version)"
  minimum_system="$(appcast_field minimum_system)"
  url="$(appcast_field url)"
  length="$(appcast_field length)"
  signature="$(appcast_field signature)"
  [[ "$version" == "$(plist_read CFBundleShortVersionString)" ]] || fail "appcast short version mismatch: $version"
  [[ "$build" == "$(plist_read CFBundleVersion)" ]] || fail "appcast build mismatch: $build"
  [[ "$minimum_system" == "$(plist_read LSMinimumSystemVersion)" ]] \
    || fail "appcast minimum macOS version mismatch: $minimum_system"
  [[ "$url" == https://*"/$(basename "$DMG_PATH")" ]] || fail "appcast URL does not target the release DMG: $url"
  if [[ -n "$RELEASE_TAG" && -n "${GITHUB_REPOSITORY:-}" ]]; then
    expected_url="https://github.com/${GITHUB_REPOSITORY}/releases/download/${RELEASE_TAG}/$(basename "$DMG_PATH")"
    [[ "$url" == "$expected_url" ]] || fail "appcast URL mismatch: expected $expected_url, got $url"
  fi
  [[ "$length" == "$(stat -f '%z' "$DMG_PATH")" ]] || fail "appcast length does not match DMG"
  [[ -n "$signature" ]] || fail "appcast enclosure is missing sparkle:edSignature"

  [[ -x "$SPARKLE_SIGN_TOOL" ]] || fail "--sparkle-sign-tool is required to verify the appcast signature"
  [[ -f "$SPARKLE_PRIVATE_KEY_FILE" ]] || fail "--sparkle-private-key is required to verify the appcast signature"
  "$SPARKLE_SIGN_TOOL" --verify --ed-key-file "$SPARKLE_PRIVATE_KEY_FILE" "$DMG_PATH" "$signature" >/dev/null \
    || fail "Sparkle rejected the DMG enclosure signature"
  record_artifact "appcast" "$APPCAST_PATH"
  pass "Sparkle/update metadata and cryptographic DMG signature passed"
}

run_launch_probe() {
  [[ "$RUN_LAUNCH" == true ]] || return 0
  [[ "${INTENTIVE_SIGNED_ARTIFACT_SMOKE_ALLOW_PRODUCTION_LAUNCH:-}" == "1" ]] \
    || fail "--launch requires INTENTIVE_SIGNED_ARTIFACT_SMOKE_ALLOW_PRODUCTION_LAUNCH=1"
  [[ -n "$INSTALL_DIR" ]] || INSTALL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/intentive-signed-smoke-install.XXXXXX")"
  mkdir -p "$INSTALL_DIR"
  local installed_app executable
  installed_app="$INSTALL_DIR/Intentive.app"
  rm -rf "$installed_app"
  ditto "$APP_BUNDLE" "$installed_app"
  open -n "$installed_app" >/tmp/intentive-signed-smoke.out 2>/tmp/intentive-signed-smoke.err \
    || fail "LaunchServices failed to open signed app"
  sleep 8
  executable="$installed_app/Contents/MacOS/$(plist_read CFBundleExecutable)"
  SMOKE_PID="$(pgrep -f "$executable" | head -1 || true)"
  [[ -n "$SMOKE_PID" ]] || fail "signed app did not stay running after launch"
  pass "Signed app launches from an isolated install copy"
}

write_result_json() {
  [[ -n "$RESULT_JSON" ]] || return 0
  mkdir -p "$(dirname "$RESULT_JSON")"
  local executable team
  executable="$(plist_read CFBundleExecutable)"
  team="$(codesign -dv "$APP_BUNDLE" 2>&1 | awk -F= '/^TeamIdentifier=/{print $2; exit}')"
  CHECKS_JOINED="$(printf '%s\n' "${SMOKE_CHECKS[@]}")" \
    ARTIFACTS_JOINED="$(printf '%s\n' "${SMOKE_ARTIFACTS[@]}")" \
    RESULT_TAG="$RELEASE_TAG" \
    RESULT_TEAM="$team" \
    RESULT_VERSION="$(plist_read CFBundleShortVersionString)" \
    RESULT_BUILD="$(plist_read CFBundleVersion)" \
    RESULT_EXECUTABLE_SHA="$(sha256_file "$APP_BUNDLE/Contents/MacOS/$executable")" \
    python3 - <<'PY' >"$RESULT_JSON"
import datetime
import json
import os

artifacts = []
for line in os.environ.get("ARTIFACTS_JOINED", "").splitlines():
    if not line:
        continue
    label, path, size, digest = line.split("|", 3)
    artifacts.append({"label": label, "path": path, "size": int(size), "sha256": digest})

print(json.dumps({
    "ok": True,
    "finished_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "release_tag": os.environ.get("RESULT_TAG") or None,
    "team_id": os.environ["RESULT_TEAM"],
    "version": os.environ["RESULT_VERSION"],
    "build": os.environ["RESULT_BUILD"],
    "app_executable_sha256": os.environ["RESULT_EXECUTABLE_SHA"],
    "artifacts": artifacts,
    "checks": [line for line in os.environ.get("CHECKS_JOINED", "").splitlines() if line],
}, indent=2, sort_keys=True))
PY
}

main() {
  parse_args "$@"
  validate_release_expectations
  assert_bundle_identity
  assert_signing_and_architecture
  assert_native_boundaries
  record_artifact "app_executable" "$APP_BUNDLE/Contents/MacOS/$(plist_read CFBundleExecutable)"
  assert_dmg
  assert_appcast
  run_launch_probe
  pass "Signed desktop artifact smoke completed"
  write_result_json
}

main "$@"
