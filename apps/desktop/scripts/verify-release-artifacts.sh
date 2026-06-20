#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "release artifact verification failed: $*" >&2
  exit 1
}

assert_not_lfs_pointer() {
  local path="$1"
  if grep -q "version https://git-lfs.github.com/spec" "$path"; then
    fail "$path is still a Git LFS pointer"
  fi
}

assert_macho() {
  local path="$1"
  file "$path" | grep -q "Mach-O" || fail "$path is not a Mach-O binary"
}

assert_icns() {
  local path="$1"
  [[ -s "$path" ]] || fail "$path is missing or empty"
  file "$path" | grep -q "Mac OS X icon" || fail "$path is not an .icns icon"
}

assert_plist_value() {
  local plist="$1"
  local key="$2"
  local expected="$3"
  local actual

  actual="$(/usr/libexec/PlistBuddy -c "Print :$key" "$plist" 2>/dev/null)" ||
    fail "$plist is missing $key"
  [[ "$actual" == "$expected" ]] ||
    fail "$plist has $key=$actual, expected $expected"
}

assert_helper_bundle() {
  local helper_app="$1"
  local helper_binary="$helper_app/Contents/MacOS/screenpipe"
  local helper_icon="$helper_app/Contents/Resources/icon.icns"
  local helper_plist="$helper_app/Contents/Info.plist"

  [[ -d "$helper_app" ]] || fail "$helper_app is missing"
  [[ -x "$helper_binary" ]] || fail "$helper_binary is missing or not executable"
  [[ -f "$helper_plist" ]] || fail "$helper_plist is missing"
  assert_not_lfs_pointer "$helper_binary"
  assert_macho "$helper_binary"
  assert_icns "$helper_icon"
  assert_plist_value "$helper_plist" CFBundleDisplayName Intentive
  assert_plist_value "$helper_plist" CFBundleName Intentive
  assert_plist_value "$helper_plist" CFBundleIdentifier com.heyintentive.capture
  assert_plist_value "$helper_plist" CFBundleExecutable screenpipe
  assert_plist_value "$helper_plist" CFBundleIconFile icon.icns
  assert_plist_value "$helper_plist" LSBackgroundOnly true
}

assert_signed_runtime() {
  local path="$1"
  local details
  details="$(codesign -dv --verbose=4 "$path" 2>&1)"
  echo "$details"
  echo "$details" | grep -q "flags=.*runtime" || fail "$path is not signed with hardened runtime"
  echo "$details" | grep -q "Authority=Developer ID Application: Srujan Gowda (24D6NXS6H7)" ||
    fail "$path is not signed by the expected Developer ID identity"
}

verify_source_resources() {
  local root="${1:-apps/desktop/src-tauri}"
  local helper="$root/resources/Intentive Capture.app"
  local ollama="$root/resources/ollama"

  assert_helper_bundle "$helper"
  [[ -x "$ollama" ]] || fail "$ollama is missing or not executable"
  assert_not_lfs_pointer "$ollama"
  assert_macho "$ollama"
}

verify_latest_json() {
  local latest="$1"
  local tarball="$2"
  local signature="$3"

  node - "$latest" "$tarball" "$signature" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [latestPath, tarballPath, signaturePath] = process.argv.slice(2);
const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
const platform = latest.platforms?.["darwin-aarch64"];
if (!platform) {
  throw new Error("latest.json is missing platforms.darwin-aarch64");
}
if (platform.url !== `https://github.com/sruj75/Intentive/releases/download/${process.env.GITHUB_REF_NAME}/${path.basename(tarballPath)}`) {
  throw new Error("latest.json points at the wrong updater tarball URL");
}
if (platform.signature !== fs.readFileSync(signaturePath, "utf8").trim()) {
  throw new Error("latest.json signature does not match the generated .sig file");
}
NODE
}

verify_built_artifacts() {
  local bundle_root="${1:-apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle}"
  local app="$bundle_root/macos/Intentive.app"
  local helper="$app/Contents/Resources/resources/Intentive Capture.app"
  local ollama="$app/Contents/Resources/resources/ollama"
  local dmg
  local tarball
  local signature
  local latest

  dmg="$(find "$bundle_root/dmg" -maxdepth 1 -name "*.dmg" -print -quit)"
  tarball="$(find "$bundle_root/macos" -maxdepth 1 -name "*.app.tar.gz" -print -quit)"
  signature="$(find "$bundle_root/macos" -maxdepth 1 -name "*.app.tar.gz.sig" -print -quit)"
  latest="$bundle_root/macos/latest.json"

  [[ -d "$app" ]] || fail "$app is missing"
  [[ -d "$helper" ]] || fail "$helper is missing from nested app resources"
  [[ ! -e "$bundle_root/macos/Intentive Capture.app" ]] ||
    fail "helper app is exposed as a sibling macOS app"
  [[ ! -e "$app/Contents/Resources/Intentive Capture.app" ]] ||
    fail "helper app is exposed outside Contents/Resources/resources"
  [[ -n "$dmg" && -f "$dmg" ]] || fail "DMG artifact is missing"
  [[ -n "$tarball" && -f "$tarball" ]] || fail "updater tarball artifact is missing"
  [[ -n "$signature" && -f "$signature" ]] || fail "updater signature artifact is missing"
  [[ -f "$latest" ]] || fail "latest.json is missing"

  assert_helper_bundle "$helper"
  assert_not_lfs_pointer "$ollama"
  assert_macho "$ollama"

  codesign --verify --deep --strict --verbose=2 "$app"
  codesign --verify --deep --strict --verbose=2 "$helper"
  assert_signed_runtime "$helper"
  assert_signed_runtime "$ollama"
  stapler validate "$app"
  stapler validate "$dmg"
  spctl -a -vvv --type install "$app"
  verify_latest_json "$latest" "$tarball" "$signature"
}

case "${1:-}" in
  source)
    verify_source_resources "${2:-apps/desktop/src-tauri}"
    ;;
  bundle)
    verify_built_artifacts "${2:-apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle}"
    ;;
  *)
    echo "usage: $0 {source [src-tauri-root] | bundle [bundle-root]}" >&2
    exit 2
    ;;
esac
