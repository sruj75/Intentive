#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Intentive Preview.app"
BUNDLE_ID="com.heyintentive.desktop.preview"
TEAM_ID="${INTENTIVE_PREVIEW_TEAM_ID:-24D6NXS6H7}"
PREVIEW_TAG="${INTENTIVE_PREVIEW_RELEASE_TAG:-desktop-preview}"
INSTALL_PATH="/Applications/$APP_NAME"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/intentive-preview.XXXXXX")"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

fail() {
  echo "Desktop Preview install failed: $*" >&2
  exit 1
}

command -v gh >/dev/null 2>&1 || fail "gh is required"
command -v ditto >/dev/null 2>&1 || fail "ditto is required"
command -v codesign >/dev/null 2>&1 || fail "codesign is required"

REPOSITORY="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
gh release download "$PREVIEW_TAG" \
  --repo "$REPOSITORY" \
  --pattern "Intentive-Preview.zip" \
  --dir "$TEMP_DIR"
ditto -x -k "$TEMP_DIR/Intentive-Preview.zip" "$TEMP_DIR/unpacked"
SOURCE_APP="$TEMP_DIR/unpacked/$APP_NAME"
[[ -d "$SOURCE_APP" ]] || fail "download did not contain $APP_NAME"
codesign --verify --deep --strict --verbose=2 "$SOURCE_APP"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$SOURCE_APP/Contents/Info.plist")" == "$BUNDLE_ID" ]] \
  || fail "downloaded app does not have the Preview bundle identifier"
codesign -d --verbose=4 "$SOURCE_APP" 2>"$TEMP_DIR/codesign-details.txt"
grep -Fx "TeamIdentifier=$TEAM_ID" "$TEMP_DIR/codesign-details.txt" >/dev/null \
  || fail "downloaded app is not signed by the expected Apple team"

rm -rf "$INSTALL_PATH"
ditto "$SOURCE_APP" "$INSTALL_PATH"
open "$INSTALL_PATH"

echo "Installed $INSTALL_PATH"
