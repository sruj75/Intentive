#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$ROOT_DIR/tests/test-signed-artifact-smoke.sh"
node "$ROOT_DIR/tests/internal-build-contracts.test.mjs"
node "$ROOT_DIR/tests/stage2-driver-contracts.test.mjs"
"$ROOT_DIR/scripts/swiftpm.sh" test --package-path "$ROOT_DIR/Desktop"
