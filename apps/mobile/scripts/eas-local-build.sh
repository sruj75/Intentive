#!/usr/bin/env bash
set -euo pipefail

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$MOBILE_DIR/../.." && pwd)"
TEMP_ROOT="$($REPO_ROOT/scripts/development-storage.sh path temp)"

mkdir -p "$TEMP_ROOT"
WORKING_DIR="$(mktemp -d "$TEMP_ROOT/eas-local.XXXXXX")"
cleanup() { rm -rf -- "$WORKING_DIR"; }
trap cleanup EXIT INT TERM

cd "$MOBILE_DIR"
EAS_LOCAL_BUILD_WORKINGDIR="$WORKING_DIR" \
  npx eas-cli build --platform ios --local "$@"
