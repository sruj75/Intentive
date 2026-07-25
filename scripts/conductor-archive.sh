#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${CONDUCTOR_WORKSPACE_PATH:-$PWD}"
cd "$WORKSPACE"

REPO_ROOT="$(git rev-parse --show-toplevel)"
CONTEXT="$REPO_ROOT/.context"
STORAGE="$REPO_ROOT/scripts/development-storage.sh"

if [[ -d "$CONTEXT" ]]; then
  find "$CONTEXT" -mindepth 1 -maxdepth 1 -type d \
    \( -name 'swiftpm-*' -o -name DerivedData -o -name release-smoke -o -name .build -o -name tmp \) \
    -exec rm -rf -- {} +
  find "$CONTEXT" -type d -name node_modules -prune -exec rm -rf -- {} +

  context_kib="$(du -sk "$CONTEXT" | awk '{print $1}')"
  if (( context_kib > 262144 )); then
    echo "conductor archive: .context still exceeds 256 MiB; review durable evidence before archiving:" >&2
    find "$CONTEXT" -mindepth 1 -maxdepth 1 -print0 \
      | xargs -0 du -sh \
      | sort -hr >&2
    exit 1
  fi
fi

workspace_build_root="$($STORAGE path workspace)"
case "$workspace_build_root" in
  /Volumes/T9/Developer/Intentive/workspaces/*|"$REPO_ROOT"/.build/intentive-development/workspaces/*)
    rm -rf -- "$workspace_build_root"
    ;;
  *)
    echo "conductor archive: refusing unsafe build-root deletion: $workspace_build_root" >&2
    exit 1
    ;;
esac

rm -rf -- "$REPO_ROOT/apps/desktop/macos/Desktop/.build"
rm -f -- "$REPO_ROOT"/apps/mobile/build-*.tar.gz

echo "Conductor archive cleanup complete; durable .context evidence preserved."
