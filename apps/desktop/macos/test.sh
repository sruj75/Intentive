#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
xcrun swift test --package-path "$ROOT_DIR/Desktop"
