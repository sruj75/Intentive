#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MACOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SMOKE="$MACOS_DIR/scripts/smoke-signed-desktop-artifact.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

TMP_ROOTS=()
cleanup() {
  [[ "${#TMP_ROOTS[@]}" -gt 0 ]] || return 0
  for path in "${TMP_ROOTS[@]}"; do
    [[ -n "$path" ]] && rm -rf "$path"
  done
}
trap cleanup EXIT

[[ -x "$SMOKE" ]] || fail "signed artifact smoke script must be executable"

help_output="$(mktemp "${TMPDIR:-/tmp}/intentive-smoke-help.XXXXXX")"
TMP_ROOTS+=("$help_output")
"$SMOKE" --help >"$help_output"

for required in \
  "Launch + identity" \
  "Developer ID signing" \
  "Sparkle/update metadata" \
  "DMG install artifact" \
  "Native framework integrity" \
  "Local Screen Memory assets"; do
  rg -Fq "$required" "$help_output" || fail "help is missing smoke path: $required"
done

for required_source_check in \
  'LSMinimumSystemVersion' \
  'GITHUB_REPOSITORY' \
  'xcrun stapler validate' \
  'com.apple.security.get-task-allow' \
  'sparkle-sign-tool is required'; do
  rg -Fq "$required_source_check" "$SMOKE" \
    || fail "signed artifact smoke is missing release check: $required_source_check"
done

invalid_err="$(mktemp "${TMPDIR:-/tmp}/intentive-smoke-invalid.XXXXXX")"
TMP_ROOTS+=("$invalid_err")
if "$SMOKE" --tag "bad-tag" >/dev/null 2>"$invalid_err"; then
  fail "missing app should fail"
fi
rg -q -- "--app is required" "$invalid_err" || fail "missing app failure should be explicit"

missing_value_err="$(mktemp "${TMPDIR:-/tmp}/intentive-smoke-value.XXXXXX")"
TMP_ROOTS+=("$missing_value_err")
if "$SMOKE" --app --dmg release.dmg >/dev/null 2>"$missing_value_err"; then
  fail "missing option value should fail"
fi
rg -q -- "--app requires a value" "$missing_value_err" || fail "missing value failure should be explicit"

tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/intentive-smoke-test.XXXXXX")"
TMP_ROOTS+=("$tmp_root")
tmp_app="$tmp_root/Intentive.app"
mkdir -p "$tmp_app/Contents/MacOS" "$tmp_app/Contents/Resources" "$tmp_app/Contents/Frameworks"
cat >"$tmp_app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>Intentive</string>
  <key>CFBundleIdentifier</key><string>com.intentive.desktop</string>
  <key>CFBundleShortVersionString</key><string>0.12.34</string>
  <key>CFBundleVersion</key><string>12034</string>
  <key>CFBundleURLTypes</key>
  <array><dict><key>CFBundleURLSchemes</key><array><string>intentive-desktop</string></array></dict></array>
  <key>SUFeedURL</key><string>https://github.com/intentive-ai/intentive/releases/latest/download/appcast.xml</string>
  <key>SUPublicEDKey</key><string>fixture-public-key</string>
</dict>
</plist>
PLIST
touch "$tmp_app/Contents/MacOS/Intentive"
chmod +x "$tmp_app/Contents/MacOS/Intentive"

bad_tag_err="$(mktemp "${TMPDIR:-/tmp}/intentive-smoke-bad-tag.XXXXXX")"
TMP_ROOTS+=("$bad_tag_err")
if "$SMOKE" --app "$tmp_app" --tag "bad-tag" >/dev/null 2>"$bad_tag_err"; then
  fail "bad release tag should fail before signing checks"
fi
rg -q "invalid release tag" "$bad_tag_err" || fail "bad tag failure should be explicit"

echo "signed artifact smoke contract tests passed"
