#!/usr/bin/env bash
set -euo pipefail

MACOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$MACOS_DIR/../../.." && pwd)"
RESULT_JSON="${INTENTIVE_ASSEMBLED_ACCEPTANCE_RESULT:-$REPO_ROOT/.context/desktop-assembled-acceptance.json}"
EVIDENCE_DIR="${INTENTIVE_ASSEMBLED_ACCEPTANCE_EVIDENCE:-$REPO_ROOT/.context/desktop-assembled-evidence}"
PROFILE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/intentive-acceptance-profile.XXXXXX")"
TOKEN_FILE="$PROFILE_ROOT/automation.json"
APP_LOG="$EVIDENCE_DIR/intentive.log"
DRIVER="$PROFILE_ROOT/IntentiveAXAcceptance"
APP_PID=""
FEED_PID=""

cleanup() {
  if [[ -n "$APP_PID" ]]; then kill "$APP_PID" >/dev/null 2>&1 || true; fi
  if [[ -n "$FEED_PID" ]]; then kill "$FEED_PID" >/dev/null 2>&1 || true; fi
  rm -rf "$PROFILE_ROOT"
}
trap cleanup EXIT

rm -rf "$EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR" "$(dirname "$RESULT_JSON")"
rm -f "$RESULT_JSON"

"$MACOS_DIR/tests/test-signed-artifact-smoke.sh"

# A manual Sparkle check requires a configured feed even in the unsigned local
# acceptance bundle. Serve an intentionally empty, valid appcast on loopback;
# Stage 2 separately proves the signed N-1 -> candidate update path.
FEED_DIR="$MACOS_DIR/AcceptanceDriver/Fixtures"
FEED_PORT=$((49152 + RANDOM % 12000))
python3 -m http.server "$FEED_PORT" --bind 127.0.0.1 --directory "$FEED_DIR" \
  >"$EVIDENCE_DIR/sparkle-feed.log" 2>&1 &
FEED_PID="$!"
for _ in {1..100}; do
  curl --fail --silent "http://127.0.0.1:$FEED_PORT/appcast.xml" >/dev/null && break
  kill -0 "$FEED_PID" >/dev/null 2>&1 || { echo "Acceptance Sparkle feed failed to start" >&2; exit 1; }
  sleep 0.05
done
curl --fail --silent "http://127.0.0.1:$FEED_PORT/appcast.xml" >/dev/null

APP_BUNDLE="$(
  CONFIGURATION=debug \
  INTENTIVE_APP_NAME=Intentive-Acceptance \
  INTENTIVE_BUNDLE_ID=com.heyintentive.desktop.dev \
  INTENTIVE_SPARKLE_FEED_URL="http://127.0.0.1:$FEED_PORT/appcast.xml" \
  INTENTIVE_SPARKLE_PUBLIC_ED_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" \
  "$MACOS_DIR/scripts/build-app-bundle.sh" | tail -n 1
)"
[[ -d "$APP_BUNDLE" ]] || { echo "Assembled app bundle missing: $APP_BUNDLE" >&2; exit 1; }

xcrun swiftc \
  -framework AppKit \
  -framework ApplicationServices \
  "$MACOS_DIR/AcceptanceDriver/main.swift" \
  -o "$DRIVER"

open -n -F "$APP_BUNDLE" \
  --stdout "$APP_LOG" \
  --stderr "$APP_LOG" \
  --env "INTENTIVE_ACCEPTANCE_PROFILE_ROOT=$PROFILE_ROOT" \
  --env "INTENTIVE_AUTOMATION_TOKEN_FILE=$TOKEN_FILE" \
  --args -ApplePersistenceIgnoreState YES -NSQuitAlwaysKeepsWindows NO

for _ in {1..300}; do
  APP_PID="$(pgrep -n -f "^$APP_BUNDLE/Contents/MacOS/Intentive( |$)" || true)"
  [[ -n "$APP_PID" ]] && break
  sleep 0.1
done
if [[ -z "$APP_PID" ]]; then
  # LaunchServices occasionally acknowledges `open -n` without creating the
  # process on busy acceptance Macs. Invoke the exact same assembled bundle
  # executable directly as a deterministic fallback.
  INTENTIVE_ACCEPTANCE_PROFILE_ROOT="$PROFILE_ROOT" \
  INTENTIVE_AUTOMATION_TOKEN_FILE="$TOKEN_FILE" \
    "$APP_BUNDLE/Contents/MacOS/Intentive" \
    -ApplePersistenceIgnoreState YES -NSQuitAlwaysKeepsWindows NO \
    >>"$APP_LOG" 2>&1 &
  APP_PID="$!"
fi
kill -0 "$APP_PID" >/dev/null 2>&1 || { echo "Intentive process did not launch" >&2; exit 1; }

for _ in {1..300}; do
  [[ -f "$TOKEN_FILE" ]] && break
  kill -0 "$APP_PID" >/dev/null 2>&1 || { echo "Intentive exited before acceptance" >&2; exit 1; }
  sleep 0.1
done
[[ -f "$TOKEN_FILE" ]] || { echo "Automation bridge did not become ready" >&2; exit 1; }
[[ "$(stat -f '%Lp' "$TOKEN_FILE")" == "600" ]] || { echo "Automation token mode is not 0600" >&2; exit 1; }

INTENTIVE_AUTOMATION_TOKEN_FILE="$TOKEN_FILE" \
  "$DRIVER" "$APP_PID" "$RESULT_JSON" "$EVIDENCE_DIR" "$(git -C "$REPO_ROOT" rev-parse HEAD)" "$APP_LOG"

pnpm --dir "$REPO_ROOT/packages/protocol" test
echo "Assembled Desktop AX acceptance passed: $RESULT_JSON"
