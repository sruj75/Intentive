#!/usr/bin/env bash
set -euo pipefail
export PATH="/bin:/usr/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MACOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SMOKE="$MACOS_DIR/scripts/smoke-signed-desktop-artifact.sh"
VAD_MODEL_VERIFIER="$MACOS_DIR/scripts/verify-silero-vad-model.sh"
PUBLIC_ENDPOINT_VERIFIER="$MACOS_DIR/scripts/verify-public-endpoint.sh"
VAD_MODEL_SOURCE="$MACOS_DIR/Desktop/Sources/IntentiveDesktopNativeAdapters/Resources/silero_vad.onnx"

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
[[ -x "$VAD_MODEL_VERIFIER" ]] || fail "Silero VAD model verifier must be executable"
[[ -x "$PUBLIC_ENDPOINT_VERIFIER" ]] || fail "public endpoint verifier must be executable"

"$VAD_MODEL_VERIFIER" "$VAD_MODEL_SOURCE" >/dev/null \
  || fail "the checked-out Silero VAD model must match the release identity"

"$PUBLIC_ENDPOINT_VERIFIER" "fixture" "https://api.example.com/path" \
  || fail "a public HTTPS endpoint must satisfy the release contract"
for invalid_endpoint in \
  "https://example.com:abc" \
  "https://example.com:70000" \
  "https://user:password@example.com" \
  "https://LOCALHOST" \
  "https://service.localhost/path" \
  "https://127.0.0.2" \
  "https://0.0.0.0" \
  "https://[::1]" \
  "https://[::]"; do
  if "$PUBLIC_ENDPOINT_VERIFIER" "fixture" "$invalid_endpoint" >/dev/null 2>&1; then
    fail "loopback or unspecified endpoint must be rejected: $invalid_endpoint"
  fi
done

pointer_model="$(mktemp "${TMPDIR:-/tmp}/intentive-vad-pointer.XXXXXX")"
TMP_ROOTS+=("$pointer_model")
printf '%s\n' \
  "version https://git-lfs.github.com/spec/v1" \
  "oid sha256:a4a068cd6cf1ea8355b84327595838ca748ec29a25bc91fc82e6c299ccdc5808" \
  "size 2243022" >"$pointer_model"
pointer_err="$(mktemp "${TMPDIR:-/tmp}/intentive-vad-pointer-error.XXXXXX")"
TMP_ROOTS+=("$pointer_err")
if "$VAD_MODEL_VERIFIER" "$pointer_model" >/dev/null 2>"$pointer_err"; then
  fail "an LFS pointer must not satisfy the Silero VAD release contract"
fi
grep -Fq -- "Git LFS pointer" "$pointer_err" \
  || fail "the LFS pointer failure must explain the checkout problem"

truncated_model="$(mktemp "${TMPDIR:-/tmp}/intentive-vad-truncated.XXXXXX")"
TMP_ROOTS+=("$truncated_model")
printf 'not-the-model' >"$truncated_model"
truncated_err="$(mktemp "${TMPDIR:-/tmp}/intentive-vad-truncated-error.XXXXXX")"
TMP_ROOTS+=("$truncated_err")
if "$VAD_MODEL_VERIFIER" "$truncated_model" >/dev/null 2>"$truncated_err"; then
  fail "a truncated Silero VAD model must not satisfy the release contract"
fi
grep -Fq -- "size mismatch" "$truncated_err" \
  || fail "the truncated model failure must identify its size mismatch"

corrupt_model="$(mktemp "${TMPDIR:-/tmp}/intentive-vad-corrupt.XXXXXX")"
TMP_ROOTS+=("$corrupt_model")
dd if=/dev/zero of="$corrupt_model" bs=2243022 count=1 2>/dev/null
corrupt_err="$(mktemp "${TMPDIR:-/tmp}/intentive-vad-corrupt-error.XXXXXX")"
TMP_ROOTS+=("$corrupt_err")
if "$VAD_MODEL_VERIFIER" "$corrupt_model" >/dev/null 2>"$corrupt_err"; then
  fail "a same-size corrupt Silero VAD model must not satisfy the release contract"
fi
grep -Fq -- "digest mismatch" "$corrupt_err" \
  || fail "the corrupt model failure must identify its digest mismatch"

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
  grep -Fq -- "$required" "$help_output" || fail "help is missing smoke path: $required"
done

for required_source_check in \
  'LSMinimumSystemVersion' \
  'IntentiveControlPlaneURL' \
  'IntentiveHostedAuthURL' \
  'GITHUB_REPOSITORY' \
  'xcrun stapler validate' \
  'com.apple.security.get-task-allow' \
  'sparkle-sign-tool is required'; do
  grep -Fq -- "$required_source_check" "$SMOKE" \
    || fail "signed artifact smoke is missing release check: $required_source_check"
done

invalid_err="$(mktemp "${TMPDIR:-/tmp}/intentive-smoke-invalid.XXXXXX")"
TMP_ROOTS+=("$invalid_err")
if "$SMOKE" --tag "bad-tag" >/dev/null 2>"$invalid_err"; then
  fail "missing app should fail"
fi
grep -q -- "--app is required" "$invalid_err" || fail "missing app failure should be explicit"

missing_value_err="$(mktemp "${TMPDIR:-/tmp}/intentive-smoke-value.XXXXXX")"
TMP_ROOTS+=("$missing_value_err")
if "$SMOKE" --app --dmg release.dmg >/dev/null 2>"$missing_value_err"; then
  fail "missing option value should fail"
fi
grep -q -- "--app requires a value" "$missing_value_err" || fail "missing value failure should be explicit"

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
  <key>CFBundleIdentifier</key><string>com.heyintentive.desktop</string>
  <key>CFBundleShortVersionString</key><string>0.12.34</string>
  <key>CFBundleVersion</key><string>12034</string>
  <key>CFBundleURLTypes</key>
  <array><dict><key>CFBundleURLSchemes</key><array><string>intentive-desktop</string></array></dict></array>
  <key>SUFeedURL</key><string>https://github.com/intentive-ai/intentive/releases/latest/download/appcast.xml</string>
  <key>SUPublicEDKey</key><string>fixture-public-key</string>
  <key>IntentiveControlPlaneURL</key><string>https://control-plane.example.com</string>
  <key>IntentiveHostedAuthURL</key><string>https://auth.example.com/sign-in</string>
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
grep -q -- "invalid release tag" "$bad_tag_err" || fail "bad tag failure should be explicit"

echo "signed artifact smoke contract tests passed"
