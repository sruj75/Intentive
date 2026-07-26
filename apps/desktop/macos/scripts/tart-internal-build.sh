#!/usr/bin/env bash
set -euo pipefail

# Builds a native Intentive.app and runs it in a disposable Tart macOS VM.
# The VM is the clean permission slate: every run clones a pristine base before
# the user grants Screen Recording, Microphone, or Accessibility permission.

MACOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_SCRIPT="${INTENTIVE_INTERNAL_BUILD_SCRIPT:-$MACOS_DIR/scripts/build-app-bundle.sh}"
VERIFY_SCRIPT="${INTENTIVE_INTERNAL_VERIFY_SCRIPT:-$MACOS_DIR/scripts/verify-app-bundle.sh}"
CONFIGURATION="${INTENTIVE_INTERNAL_BUILD_CONFIGURATION:-debug}"
APP_NAME="${INTENTIVE_APP_NAME:-Intentive Dev}"
BUNDLE_ID="${INTENTIVE_BUNDLE_ID:-com.heyintentive.desktop.dev}"
APP_VERSION="${INTENTIVE_APP_VERSION:-0.1.0}"
APP_BUILD="${INTENTIVE_APP_BUILD:-901}"
AUTH_CALLBACK_SCHEME="${INTENTIVE_AUTH_CALLBACK_SCHEME:-intentive-desktop}"
CONTROL_PLANE_URL="${INTENTIVE_CONTROL_PLANE_URL:-}"
HOSTED_AUTH_URL="${INTENTIVE_HOSTED_AUTH_URL:-}"
AUTH_TOKEN_EXCHANGE_URL="${INTENTIVE_AUTH_TOKEN_EXCHANGE_URL:-}"
TART_STORE="${TART_HOME:-$HOME/.tart}"
TART_BASE_VM="${TART_BASE_VM:-intentive-base}"
TART_VM_NAME="${TART_VM_NAME:-intentive-clean}"
TART_BASE_IMAGE="${TART_BASE_IMAGE:-}"
DEFAULT_OCI_BASE="ghcr.io/cirruslabs/macos-tahoe-base:latest"
MIN_FREE_GB_PULL="${MIN_FREE_GB_PULL:-90}"
CLEANED=0

log() { printf '\033[1;34m▸\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m✗ internal build:\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: tart-internal-build.sh [run|--build|--delete|--status|--create-base <ipsw-url-or-path>]

  run (default)  Build Intentive.app, clone a pristine Tart VM, and delete it on exit.
  --build        Build and codesign Intentive.app only.
  --delete       Stop and delete the disposable VM only; the base is never deleted.
  --status       Show Tart VMs.
  --create-base  Create a one-time local pristine base from an Apple IPSW.

Configuration:
  TART_BASE_IMAGE                  Explicit Tart base (OCI image or local VM name).
  TART_BASE_VM                     Local base VM name (default: intentive-base).
  TART_VM_NAME                     Disposable clone name (default: intentive-clean).
  INTENTIVE_INTERNAL_SIGNING_IDENTITY
                                   Signing identity; defaults to ad-hoc signing.
  INTENTIVE_INTERNAL_BUILD_CONFIGURATION
                                   SwiftPM configuration (default: debug).
  INTENTIVE_CONTROL_PLANE_URL       Optional local Control Plane URL.
  INTENTIVE_HOSTED_AUTH_URL         Optional hosted-auth URL for development.
  INTENTIVE_AUTH_TOKEN_EXCHANGE_URL Optional hosted-auth exchange URL.
EOF
}

require_apple_silicon() {
  [[ "$(uname -m)" == "arm64" ]] || fail "Apple Silicon is required; host is $(uname -m)."
}

require_tart() {
  command -v tart >/dev/null 2>&1 || fail "Tart is required. Install it first: https://tart.run"
}

free_gb() {
  local path="$1"
  while [[ ! -e "$path" && "$path" != "/" ]]; do path="$(dirname "$path")"; done
  df -g "$path" 2>/dev/null | awk 'NR == 2 { print $4 }'
}

has_local_vm() {
  tart list 2>/dev/null | awk 'NR > 1 { print $2 }' | grep -qx "$1"
}

resolved_base_image() {
  if [[ -n "$TART_BASE_IMAGE" ]]; then
    printf '%s\n' "$TART_BASE_IMAGE"
  elif has_local_vm "$TART_BASE_VM"; then
    printf '%s\n' "$TART_BASE_VM"
  else
    printf '%s\n' "$DEFAULT_OCI_BASE"
  fi
}

destroy_instance() {
  tart stop "$TART_VM_NAME" >/dev/null 2>&1 || true
  tart delete "$TART_VM_NAME" >/dev/null 2>&1 || true
}

vm_state() {
  tart list 2>/dev/null | awk -v name="$TART_VM_NAME" 'NR > 1 && $2 == name { print $NF }'
}

cleanup_vm() {
  [[ "$CLEANED" == 1 ]] && return
  CLEANED=1
  log "Cleaning up ephemeral VM '$TART_VM_NAME'..."
  destroy_instance
}

build_app() {
  local app_bundle signing_identity
  log "Building native $APP_NAME.app ($CONFIGURATION)..."
  app_bundle="$(
    CONFIGURATION="$CONFIGURATION" \
      INTENTIVE_APP_NAME="$APP_NAME" \
      INTENTIVE_BUNDLE_ID="$BUNDLE_ID" \
      INTENTIVE_APP_VERSION="$APP_VERSION" \
      INTENTIVE_APP_BUILD="$APP_BUILD" \
      INTENTIVE_AUTH_CALLBACK_SCHEME="$AUTH_CALLBACK_SCHEME" \
      INTENTIVE_CONTROL_PLANE_URL="$CONTROL_PLANE_URL" \
      INTENTIVE_HOSTED_AUTH_URL="$HOSTED_AUTH_URL" \
      INTENTIVE_AUTH_TOKEN_EXCHANGE_URL="$AUTH_TOKEN_EXCHANGE_URL" \
      INTENTIVE_SPARKLE_FEED_URL="" \
      INTENTIVE_SPARKLE_PUBLIC_ED_KEY="" \
      GITHUB_REPOSITORY="" \
      "$BUILD_SCRIPT" | tail -n 1
  )"
  [[ -d "$app_bundle" ]] || fail "Bundle builder did not produce an app: $app_bundle"

  signing_identity="${INTENTIVE_INTERNAL_SIGNING_IDENTITY:--}"
  if [[ "$signing_identity" == "-" ]]; then
    warn "Ad-hoc signing internal build. This is suitable for a fresh VM permission flow, not Gatekeeper/notarization validation."
    for framework in \
      "$app_bundle/Contents/Frameworks/Sparkle.framework" \
      "$app_bundle/Contents/Frameworks/Sentry.framework"; do
      codesign --force --deep --sign - "$framework"
    done
    codesign --force --sign - \
      "$app_bundle/Contents/MacOS/IntentiveLoginLauncher"
    codesign --force --sign - "$app_bundle"
  else
    log "Signing internal build with '$signing_identity'..."
    for framework in \
      "$app_bundle/Contents/Frameworks/Sparkle.framework" \
      "$app_bundle/Contents/Frameworks/Sentry.framework"; do
      codesign --force --deep --options runtime --sign "$signing_identity" "$framework"
    done
    codesign --force --options runtime --sign "$signing_identity" \
      "$app_bundle/Contents/MacOS/IntentiveLoginLauncher"
    codesign --force --options runtime --sign "$signing_identity" "$app_bundle"
  fi
  codesign --verify --deep --strict --verbose=2 "$app_bundle" >&2
  log "Verifying exact internal artifact $app_bundle..."
  CONFIGURATION="$CONFIGURATION" \
    INTENTIVE_APP_NAME="$APP_NAME" \
    INTENTIVE_BUNDLE_ID="$BUNDLE_ID" \
    INTENTIVE_APP_VERSION="$APP_VERSION" \
    INTENTIVE_APP_BUILD="$APP_BUILD" \
    INTENTIVE_AUTH_CALLBACK_SCHEME="$AUTH_CALLBACK_SCHEME" \
    INTENTIVE_CONTROL_PLANE_URL="$CONTROL_PLANE_URL" \
    INTENTIVE_HOSTED_AUTH_URL="$HOSTED_AUTH_URL" \
    INTENTIVE_AUTH_TOKEN_EXCHANGE_URL="$AUTH_TOKEN_EXCHANGE_URL" \
    INTENTIVE_SPARKLE_FEED_URL="" \
    INTENTIVE_SPARKLE_PUBLIC_ED_KEY="" \
    "$VERIFY_SCRIPT" --app "$app_bundle" >&2
  printf '%s\n' "$app_bundle"
}

ensure_base_image() {
  local base free
  base="$(resolved_base_image)"
  if has_local_vm "$base" || tart list --source oci 2>/dev/null | grep -Fq "$base"; then
    printf '%s\n' "$base"
    return
  fi
  if [[ "$base" != */* ]]; then
    fail "Local base VM '$base' is absent. Create it with: $0 --create-base <ipsw-url-or-path>"
  fi
  free="$(free_gb "$TART_STORE")"
  [[ "${free:-0}" -ge "$MIN_FREE_GB_PULL" ]] || fail "Only ${free}GB free at $TART_STORE; pulling a base requires ${MIN_FREE_GB_PULL}GB."
  log "Pulling Tart base $base (one-time)..."
  tart pull "$base"
  printf '%s\n' "$base"
}

create_base() {
  local source="${1:-}" local_source
  [[ -n "$source" ]] || fail "Usage: $0 --create-base <ipsw-url-or-path>"
  has_local_vm "$TART_BASE_VM" && fail "Base '$TART_BASE_VM' already exists; choose another TART_BASE_VM or remove it deliberately."

  if [[ "$source" =~ ^https?:// ]]; then
    mkdir -p "$TART_STORE"
    local_source="$TART_STORE/$(basename "$source")"
    log "Downloading IPSW resumably to $local_source..."
    curl -4 -L -C - --retry 8 --retry-delay 5 --retry-all-errors --connect-timeout 30 -o "$local_source" "$source"
    source="$local_source"
  fi
  [[ -f "$source" ]] || fail "IPSW not found: $source"
  log "Creating pristine base '$TART_BASE_VM' from $source..."
  tart create --from-ipsw "$source" "$TART_BASE_VM" --disk-size 60
  cat <<EOF
Base created. Boot it once with:
  tart run $TART_BASE_VM
Complete Setup Assistant, create an admin user, and do not install Intentive or grant permissions.
Shut it down afterward; every internal build will clone this clean slate.
EOF
}

run_vm() {
  local app_bundle base state
  app_bundle="$(build_app)"
  base="$(ensure_base_image)"
  [[ "$TART_VM_NAME" != "$base" ]] || fail "TART_VM_NAME must differ from the base image."
  destroy_instance
  log "Cloning '$TART_VM_NAME' from pristine base '$base'..."
  tart clone "$base" "$TART_VM_NAME"
  trap cleanup_vm EXIT
  trap 'cleanup_vm; exit 130' INT
  trap 'cleanup_vm; exit 143' TERM
  cat <<EOF
Starting '$TART_VM_NAME'. The native bundle is shared inside the guest at:
  /Volumes/My Shared Files/intentive-build/$APP_NAME.app

Copy it to /Applications, launch it, and exercise the fresh Screen Recording,
Microphone, and Accessibility flow. The VM display validates permission/readiness
behavior; it does not represent a host multi-display capture setup.
EOF
  tart run --dir="intentive-build:$(dirname "$app_bundle"):ro" "$TART_VM_NAME"
  # Tart can detach after opening its VM window. Keep the runner alive until the
  # guest stops, so closing that window always reaches the same cleanup path as
  # an explicit --delete.
  state="$(vm_state)"
  while [[ -n "$state" && "$state" != "stopped" ]]; do
    sleep 1
    state="$(vm_state)"
  done
}

require_apple_silicon
case "${1:-run}" in
  run|"") require_tart; run_vm ;;
  --build) build_app ;;
  --delete) require_tart; destroy_instance; log "Deleted disposable VM '$TART_VM_NAME'; base preserved." ;;
  --status) require_tart; tart list ;;
  --create-base) require_tart; create_base "${2:-}" ;;
  --help|-h) usage ;;
  *) usage >&2; exit 1 ;;
esac
