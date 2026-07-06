#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_PATH="$ROOT_DIR/Desktop"
APP_NAME="${INTENTIVE_APP_NAME:-Intentive Dev}"

echo "Building $APP_NAME with SwiftPM..."
xcrun swift build -c debug --package-path "$PACKAGE_PATH"

BINARY="$PACKAGE_PATH/.build/debug/Intentive"
if [ ! -x "$BINARY" ]; then
  echo "error: expected SwiftPM binary at $BINARY" >&2
  exit 1
fi

echo "Launching $APP_NAME..."
exec "$BINARY"
