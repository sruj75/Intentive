#!/usr/bin/env bash
set -euo pipefail

MACOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$MACOS_DIR/../../.." && pwd)"
STORAGE="$REPO_ROOT/scripts/development-storage.sh"
SCRATCH_PATH="${INTENTIVE_SWIFTPM_SCRATCH_PATH:-$($STORAGE path swiftpm-desktop)}"

mkdir -p "$SCRATCH_PATH"
exec xcrun swift "$@" --scratch-path "$SCRATCH_PATH"
