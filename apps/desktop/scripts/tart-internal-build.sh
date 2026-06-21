#!/usr/bin/env bash
set -euo pipefail

# Internal-build runbook, automated.
#
# Builds a real `--debug` Intentive.app bundle and runs it inside a DISPOSABLE,
# EPHEMERAL Tart macOS VM, so the macOS permission-grant / capture-readiness flow
# can be exercised from a clean TCC slate without polluting the host Mac.
#
# This is the desktop equivalent of "boot a fresh simulator and install the app":
# the host Mac is the real device; the VM is the disposable, reset-able slate.
#
# Ephemeral by default — leaves no trace:
#   - every run starts from a PRISTINE clone (any stale instance is deleted first),
#   - on exit (normal, window-close, Ctrl-C, or TERM) the instance is stopped and
#     deleted, taking all in-guest servers (ScreenPipe, Ollama, …) with it.
# Because those servers live INSIDE the guest, deleting the instance is a hard
# guarantee that nothing keeps running on the host. (A SIGKILL -9 can't be
# trapped, but the next run deletes the stale instance before cloning, so it
# still self-heals. `--delete` is the manual nuke.)
#
# Usage:
#   scripts/tart-internal-build.sh            # build + fresh ephemeral VM + run (auto-clean on exit)
#   scripts/tart-internal-build.sh --keep     # same, but DON'T delete on exit (persist for re-use)
#   scripts/tart-internal-build.sh --build    # only build the --debug .app
#   scripts/tart-internal-build.sh --delete   # stop + delete the instance now (no-op if absent)
#
# Offloading off a small boot volume (the heavy bits are the VM images and the
# Rust target/). Point both at a roomy volume via env vars — the script reads
# them and checks free space on the right volume:
#   TART_HOME=/Volumes/T9/Tart \
#   CARGO_TARGET_DIR=/Volumes/T9/intentive-target \
#     scripts/tart-internal-build.sh
#
# See docs/INTERNAL-BUILD.md.

# --- config -----------------------------------------------------------------
BASE_IMAGE="${TART_BASE_IMAGE:-ghcr.io/cirruslabs/macos-sequoia-base:latest}"
VM_NAME="${TART_VM_NAME:-intentive-clean}"
MIN_FREE_GB_PULL="${MIN_FREE_GB_PULL:-90}"   # first base-image pull needs ~50-90GB
MIN_FREE_GB_BUILD="${MIN_FREE_GB_BUILD:-12}" # target/ + bundled ScreenPipe/Ollama
EPHEMERAL=1                                  # auto-delete the instance on exit (--keep flips)
CLEANED=0

DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Where Tart stores images/clones (tart reads TART_HOME natively) and where the
# Rust build lands (tauri follows CARGO_TARGET_DIR). Both default to local disk.
TART_STORE="${TART_HOME:-$HOME/.tart}"
TARGET_DIR="${CARGO_TARGET_DIR:-$DESKTOP_DIR/src-tauri/target}"
APP_BUNDLE="$TARGET_DIR/debug/bundle/macos/Intentive.app"

# --- helpers ----------------------------------------------------------------
log()  { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m✗ internal-build:\033[0m %s\n' "$*" >&2; exit 1; }

free_gb() {
  # available GB on the volume backing $1 (the path need not exist yet — walk up
  # to the nearest existing ancestor so df resolves the right mount).
  local p="$1"
  while [[ ! -e "$p" && "$p" != "/" ]]; do p="$(dirname "$p")"; done
  df -g "$p" 2>/dev/null | awk 'NR==2 {print $4}'
}

require_arm64() {
  [[ "$(uname -m)" == "arm64" ]] || fail "Apple Silicon only (V1). Host is $(uname -m)."
}

ensure_tart() {
  if ! command -v tart >/dev/null 2>&1; then
    command -v brew >/dev/null 2>&1 || fail "tart not installed and Homebrew missing. Install: https://tart.run"
    log "Installing tart via Homebrew…"
    brew install cirruslabs/cli/tart
  fi
}

# Stop + delete the named instance. Safe to call when it doesn't exist.
destroy_instance() {
  tart stop "$VM_NAME" >/dev/null 2>&1 || true
  tart delete "$VM_NAME" >/dev/null 2>&1 || true
}

# Trap target: tear the ephemeral instance down exactly once, on any exit path.
cleanup_vm() {
  [[ "$CLEANED" == 1 ]] && return 0
  CLEANED=1
  if [[ "$EPHEMERAL" != 1 ]]; then
    log "Leaving VM '$VM_NAME' in place (--keep). Remove later with: scripts/tart-internal-build.sh --delete"
    return 0
  fi
  log "Cleaning up ephemeral VM '$VM_NAME' (stop + delete; all in-guest servers die with it)…"
  destroy_instance
}

# --- steps ------------------------------------------------------------------
build_debug_app() {
  local free; free="$(free_gb "$TARGET_DIR")"
  if [[ "${free:-0}" -lt "$MIN_FREE_GB_BUILD" ]]; then
    fail "Only ${free}GB free on the target volume ($TARGET_DIR); the --debug build needs ~${MIN_FREE_GB_BUILD}GB. Set CARGO_TARGET_DIR to a roomier volume or free space."
  fi
  log "Building --debug .app bundle → $TARGET_DIR (real backend, ScreenPipe + Ollama staged)…"
  # .app only (skip the .dmg) — faster and smaller; we install the bundle directly.
  # Disable updater artifacts: an ephemeral internal build never ships through the
  # updater, and signing the updater tarball would otherwise require
  # TAURI_SIGNING_PRIVATE_KEY (createUpdaterArtifacts is true in tauri.conf.json).
  ( cd "$DESKTOP_DIR" && CARGO_TARGET_DIR="$TARGET_DIR" \
    pnpm tauri build --debug --bundles app \
      --config '{"bundle":{"createUpdaterArtifacts":false}}' )
  [[ -d "$APP_BUNDLE" ]] || fail "Expected bundle not found at $APP_BUNDLE"
  log "Built: $APP_BUNDLE"
}

ensure_base_image() {
  if tart list 2>/dev/null | awk '{print $2}' | grep -qx "$(basename "$BASE_IMAGE" | cut -d: -f1)"; then
    return 0
  fi
  if tart list --source oci 2>/dev/null | grep -q "$BASE_IMAGE"; then
    return 0
  fi
  local free; free="$(free_gb "$TART_STORE")"
  if [[ "${free:-0}" -lt "$MIN_FREE_GB_PULL" ]]; then
    fail "Only ${free}GB free on the Tart store volume ($TART_STORE); pulling $BASE_IMAGE needs ~${MIN_FREE_GB_PULL}GB. Set TART_HOME to a roomier volume or free space — a partial pull on a near-full boot volume can wedge macOS."
  fi
  log "Pulling base image $BASE_IMAGE → $TART_STORE (one-time, ~50GB)…"
  tart pull "$BASE_IMAGE"
}

# Fresh, pristine instance every run: delete any stale clone first (self-heals
# after a prior hard kill), then clone copy-on-write from the kept base template.
fresh_clone() {
  ensure_base_image
  destroy_instance
  log "Cloning pristine VM '$VM_NAME' from base (copy-on-write)…"
  tart clone "$BASE_IMAGE" "$VM_NAME"
}

run_vm() {
  build_debug_app
  fresh_clone
  trap cleanup_vm EXIT INT TERM
  log "Starting VM '$VM_NAME'. Login: admin / admin.$( [[ "$EPHEMERAL" == 1 ]] && echo ' Auto-deletes on exit.' )"
  log "The build is shared read-only inside the VM at:"
  log "    /Volumes/My Shared Files/intentive-build/Intentive.app"
  log "Inside the VM: copy it to /Applications, launch, and grant Screen"
  log "Recording + Microphone + Accessibility when prompted (fresh slate)."
  # --dir mounts the bundle's parent into the guest under "My Shared Files".
  # tart run blocks until the VM window is closed / Ctrl-C; then the trap fires.
  tart run --dir="intentive-build:$(dirname "$APP_BUNDLE")" "$VM_NAME"
}

# --- main -------------------------------------------------------------------
require_arm64
case "${1:-run}" in
  --build)  build_debug_app ;;
  --delete) ensure_tart; destroy_instance; log "Deleted VM '$VM_NAME' (base template on $TART_STORE kept)." ;;
  --keep)   ensure_tart; EPHEMERAL=0; run_vm ;;
  run|"")   ensure_tart; EPHEMERAL=1; run_vm ;;
  *)        fail "Unknown arg: $1 (use --build | --keep | --delete | run)" ;;
esac
