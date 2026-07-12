#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_PATH="$ROOT_DIR/Desktop"
SWIFTPM="$ROOT_DIR/scripts/swiftpm.sh"
APP_NAME="${INTENTIVE_APP_NAME:-Intentive Dev}"

echo "Building $APP_NAME with SwiftPM..."
"$SWIFTPM" build -c debug --package-path "$PACKAGE_PATH"

BUILD_DIR="$("$SWIFTPM" build -c debug --package-path "$PACKAGE_PATH" --show-bin-path)"
BINARY="$BUILD_DIR/Intentive"
if [ ! -x "$BINARY" ]; then
  echo "error: expected SwiftPM binary at $BINARY" >&2
  exit 1
fi

echo "Launching $APP_NAME..."
exec "$BINARY"
