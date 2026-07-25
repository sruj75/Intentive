#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_PATH="$ROOT_DIR/Desktop"
SWIFTPM="$ROOT_DIR/scripts/swiftpm.sh"
APP_ASSEMBLER="$ROOT_DIR/scripts/build-app-bundle.sh"
APP_NAME="${INTENTIVE_APP_NAME:-Intentive Dev}"
BUNDLE_ID="${INTENTIVE_BUNDLE_ID:-com.heyintentive.desktop.dev}"

echo "Building the $APP_NAME development app bundle..."
CONFIGURATION=debug \
  INTENTIVE_APP_NAME="$APP_NAME" \
  INTENTIVE_BUNDLE_ID="$BUNDLE_ID" \
  "$APP_ASSEMBLER"

BUILD_DIR="$("$SWIFTPM" build -c debug --package-path "$PACKAGE_PATH" --show-bin-path)"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"
BINARY="$APP_BUNDLE/Contents/MacOS/Intentive"
if [ ! -x "$BINARY" ]; then
  echo "error: expected assembled development app at $BINARY" >&2
  exit 1
fi

echo "Launching $APP_NAME ($BUNDLE_ID)..."
exec "$BINARY"
