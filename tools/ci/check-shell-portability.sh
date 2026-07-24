#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="/bin:/usr/bin:/usr/sbin:/sbin"

bash "$REPO_ROOT/apps/desktop/macos/tests/test-signed-artifact-smoke.sh"
