#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ASSEMBLER="$ROOT_DIR/scripts/build-app-bundle.sh"
APP_NAME="${INTENTIVE_APP_NAME:-Intentive Dev}"
BUNDLE_ID="${INTENTIVE_BUNDLE_ID:-com.heyintentive.desktop.dev}"

echo "Building the $APP_NAME development app bundle..."
APP_BUNDLE="$(
  CONFIGURATION=debug \
    INTENTIVE_APP_NAME="$APP_NAME" \
    INTENTIVE_BUNDLE_ID="$BUNDLE_ID" \
    "$APP_ASSEMBLER" | tail -n 1
)"
if [ ! -d "$APP_BUNDLE" ]; then
  echo "error: bundle assembler did not produce an app at $APP_BUNDLE" >&2
  exit 1
fi

echo "Ad-hoc signing the assembled development app..."
codesign --force --deep --sign - "$APP_BUNDLE"
codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"

BINARY="$APP_BUNDLE/Contents/MacOS/Intentive"
if [ ! -x "$BINARY" ]; then
  echo "error: expected assembled development app at $BINARY" >&2
  exit 1
fi

echo "Launching $APP_NAME ($BUNDLE_ID)..."
exec "$BINARY"
