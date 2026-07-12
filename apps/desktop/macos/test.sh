#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$ROOT_DIR/scripts/swiftpm.sh" test --package-path "$ROOT_DIR/Desktop"
