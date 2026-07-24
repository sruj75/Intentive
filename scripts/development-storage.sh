#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/intentive/development-storage.env"

if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi

workspace_name="${INTENTIVE_WORKSPACE_NAME:-$(basename "${CONDUCTOR_WORKSPACE_PATH:-$REPO_ROOT}")}"
workspace_name="$(printf '%s' "$workspace_name" | tr -cs 'A-Za-z0-9._-' '-' | sed 's/^-//; s/-$//')"
[[ -n "$workspace_name" ]] || { echo "development-storage: invalid workspace name" >&2; exit 1; }

is_mounted() {
  mount | grep -Fq "on $1 ("
}

configured_root="${INTENTIVE_DEVELOPMENT_ROOT:-}"
require_external="${INTENTIVE_REQUIRE_EXTERNAL_BUILDS:-0}"

if [[ -z "$configured_root" ]] && is_mounted /Volumes/T9; then
  configured_root="/Volumes/T9/Developer/Intentive"
fi

if [[ -n "$configured_root" ]]; then
  volume="/Volumes/$(printf '%s' "$configured_root" | cut -d/ -f3)"
  if [[ "$configured_root" == /Volumes/* ]] && ! is_mounted "$volume"; then
    if [[ "$require_external" == 1 ]]; then
      echo "development-storage: required external volume is not mounted: $volume" >&2
      exit 1
    fi
    configured_root=""
  fi
fi

if [[ -n "$configured_root" ]]; then
  storage_root="$configured_root"
  storage_kind="external"
else
  if [[ "$require_external" == 1 ]]; then
    echo "development-storage: external builds are required but no storage root is available" >&2
    exit 1
  fi
  storage_root="$REPO_ROOT/.build/intentive-development"
  storage_kind="workspace fallback"
fi

workspace_root="$storage_root/workspaces/$workspace_name"

path_for() {
  case "$1" in
    workspace) printf '%s\n' "$workspace_root" ;;
    swiftpm-desktop) printf '%s\n' "$workspace_root/swiftpm/desktop" ;;
    cargo-target) printf '%s\n' "$workspace_root/cargo/target" ;;
    temp) printf '%s\n' "$workspace_root/tmp" ;;
    *) echo "development-storage: unknown path kind: $1" >&2; exit 2 ;;
  esac
}

case "${1:-status}" in
  path)
    [[ -n "${2:-}" ]] || { echo "usage: $0 path <workspace|swiftpm-desktop|cargo-target|temp>" >&2; exit 2; }
    path_for "$2"
    ;;
  prepare)
    mkdir -p "$(path_for swiftpm-desktop)" "$(path_for cargo-target)" "$(path_for temp)"
    ;;
  status)
    printf 'workspace=%s\nstorage=%s\nroot=%s\n' "$workspace_name" "$storage_kind" "$workspace_root"
    ;;
  *)
    echo "usage: $0 [status|prepare|path <kind>]" >&2
    exit 2
    ;;
esac
