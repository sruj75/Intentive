#!/usr/bin/env bash
set -euo pipefail

MACOS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$MACOS_DIR/../../.." && pwd)"
PACKAGE_PATH="$MACOS_DIR/Desktop"
SWIFTPM="$MACOS_DIR/scripts/swiftpm.sh"
OUTPUT_DIR="$REPO_ROOT/.context/coverage"

"$MACOS_DIR/tests/test-signed-artifact-smoke.sh"
"$SWIFTPM" test --package-path "$PACKAGE_PATH" --enable-code-coverage

coverage_json="$("$SWIFTPM" test --package-path "$PACKAGE_PATH" --show-codecov-path)"
[[ -s "$coverage_json" ]] || {
  echo "Desktop coverage export is missing: $coverage_json" >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR"
cp "$coverage_json" "$OUTPUT_DIR/desktop-swift.json"
node "$REPO_ROOT/tools/coverage/summarize-swift.mjs" \
  "$OUTPUT_DIR/desktop-swift.json" \
  "$OUTPUT_DIR/desktop-swift-summary.md"
