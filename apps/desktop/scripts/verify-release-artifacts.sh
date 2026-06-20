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
  local helper="$root/resources/Intentive Capture.app/Contents/MacOS/screenpipe"
  local ollama="$root/resources/ollama"

  [[ -x "$helper" ]] || fail "$helper is missing or not executable"
  [[ -x "$ollama" ]] || fail "$ollama is missing or not executable"
  assert_not_lfs_pointer "$helper"
  assert_not_lfs_pointer "$ollama"
  assert_macho "$helper"
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
  [[ -n "$dmg" && -f "$dmg" ]] || fail "DMG artifact is missing"
  [[ -n "$tarball" && -f "$tarball" ]] || fail "updater tarball artifact is missing"
  [[ -n "$signature" && -f "$signature" ]] || fail "updater signature artifact is missing"
  [[ -f "$latest" ]] || fail "latest.json is missing"

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
