#!/usr/bin/env bash
set -euo pipefail

# Reset macOS host state that desktop dev/internal builds accumulate: DerivedData
# from `swift build`, stale caches, defaults, and TCC grants. Scope is deliberately
# the legacy bundle id (com.intentive.desktop — what the wrong hardcoded builds used)
# and the dev/internal channel (com.heyintentive.desktop.dev). It never touches the
# production dogfood install (com.heyintentive.desktop), whose Keychain, TCC grants,
# prefs, and caches belong to the signed Sparkle-managed /Applications app.
# Keeps the SwiftPM .build/ incremental cache and the T9 Tart base. Safe to run any
# time; prompts before clearing TCC.

PROG="${0##*/}"
MODE="reset"

usage() {
  cat <<EOF
Usage: $PROG [--status | --reset | --yes]

  --status   Show what would be reset; change nothing.
  --reset    Reset and prompt before clearing TCC (default).
  --yes      Reset without prompting (for scripts).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --status) MODE="status" ;;
    --reset) MODE="reset" ;;
    --yes) MODE="reset"; ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

APP_SUPPORT_DIR="$HOME/Library/Application Support"
PREFS_DIR="$HOME/Library/Preferences"
CACHES_DIR="$HOME/Library/Caches"
DERIVED_DATA_DIR="$HOME/Library/Developer/Xcode/DerivedData"

# Bundle-id prefixes whose host state we own and may reset. Scoped to the legacy
# bundle id (com.intentive.desktop, from the old hardcoded builds) and the
# dev/internal channel (com.heyintentive.desktop.dev). This deliberately AVOIDS the
# production dogfood install (com.heyintentive.desktop) — that Keychain/TCC/prefs/caches
# belong to the signed Sparkle-managed /Applications app and are not swept here.
LEGACY_APP_SUPPORT_GLOBS=(
  "com.heyintentive.tauri"
)
BUNDLE_ID_PREFIXES=(
  "com.intentive.desktop"
  "com.heyintentive.desktop.dev"
)
TCC_SERVICES=(All ScreenCapture Microphone Accessibility)

DERIVED_DATA_GLOBS=(
  "Intentive-*"
)
CACHE_GLOBS=(
  "IntentiveAXAcceptance"
  "intentive"
)

log()  { printf '\033[1;34m▸\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }

emit_if_exists() {
  [[ -e "$1" ]] && printf '%s\n' "$1" || true
}

expand_glob() {
  local dir="$1"; shift
  for pat in "$@"; do
    for f in "$dir"/$pat; do emit_if_exists "$f"; done
  done
}

bundle_id_prefs() {
  local prefix
  for prefix in "${BUNDLE_ID_PREFIXES[@]}"; do
    for f in "$PREFS_DIR"/${prefix}*.plist; do emit_if_exists "$f"; done
  done
}

bundle_id_caches() {
  local prefix
  for prefix in "${BUNDLE_ID_PREFIXES[@]}"; do
    for d in "$CACHES_DIR"/${prefix}*; do emit_if_exists "$d"; done
  done
  for d in "$CACHES_DIR"/IntentiveAXAcceptance "$CACHES_DIR"/intentive; do
    emit_if_exists "$d"
  done
}

collect_paths() {
  local f
  for f in "$APP_SUPPORT_DIR"/com.heyintentive.tauri; do emit_if_exists "$f"; done
  expand_glob "$DERIVED_DATA_DIR" "${DERIVED_DATA_GLOBS[@]}"
  bundle_id_prefs
  bundle_id_caches
}

human_size() {
  local path="$1" bytes
  bytes="$(du -sk "$path" 2>/dev/null | awk '{print $1}')"
  if [[ -z "${bytes:-}" || "$bytes" == 0 ]]; then
    printf '0B'
  elif (( bytes >= 1048576 )); then
    printf '%.1fG' "$(echo "scale=1; $bytes / 1048576" | bc)"
  elif (( bytes >= 1024 )); then
    printf '%.1fM' "$(echo "scale=1; $bytes / 1024" | bc)"
  else
    printf '%sK' "$bytes"
  fi
}

status() {
  local paths total_bytes total=0
  log "Desktop host state under legacy com.intentive.desktop / dev com.heyintentive.desktop.dev:"
  echo
  printf '  %-12s %s\n' SIZE PATH
  while IFS= read -r p; do
    [[ -n "$p" ]] || continue
    printf '  %-12s %s\n' "$(human_size "$p")" "$p"
    total=$(( total + $(du -sk "$p" 2>/dev/null | awk '{print $1}') ))
  done < <(collect_paths)
  echo
  if (( total >= 1048576 )); then
    printf '  total: ~%.1fG\n' "$(echo "scale=1; $total / 1048576" | bc)"
  elif (( total >= 1024 )); then
    printf '  total: ~%.1fM\n' "$(echo "scale=1; $total / 1024" | bc)"
  else
    printf '  total: ~%sK\n' "$total"
  fi
  echo
  log "TCC services that would be reset for com.intentive.desktop / com.heyintentive.desktop.dev:"
  for svc in "${TCC_SERVICES[@]}"; do printf '  %s\n' "$svc"; done
  echo
  log "Run without --status to reset the above."
}

reset_tcc() {
  local prefix output
  for prefix in "${BUNDLE_ID_PREFIXES[@]}"; do
    for svc in "${TCC_SERVICES[@]}"; do
      output="$(tccutil reset "$svc" "$prefix" 2>&1 || true)"
      echo "$output" | grep -v '^tccutil: Usage' || true
    done
  done
}

do_reset() {
  local path
  if [[ "${ASSUME_YES:-0}" != "1" ]]; then
    warn "This will delete DerivedData/Intentive-*, caches, prefs plists, and reset TCC grants"
    warn "for legacy com.intentive.desktop and dev com.heyintentive.desktop.dev."
    warn "Keeps the SwiftPM .build/ incremental cache and the Tart base."
    printf 'Proceed? [y/N] ' >&2
    local reply
    read -r reply
    [[ "$reply" =~ ^[yY]([eE][sS])?$ ]] || { echo "aborted" >&2; exit 1; }
  fi

  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    if [[ -d "$path" ]]; then
      log "rm -rf '$path'"
      rm -rf "$path"
    else
      log "rm -f '$path'"
      rm -f "$path"
    fi
  done < <(collect_paths)

  log "Resetting TCC grants for com.intentive.desktop / com.heyintentive.desktop.dev…"
  reset_tcc
  log "done"
}

case "$MODE" in
  status) status ;;
  reset)  do_reset ;;
esac