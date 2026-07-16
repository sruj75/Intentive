#!/usr/bin/env bash
set -euo pipefail

MACOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$MACOS_DIR/../../.." && pwd)"
RESULT_JSON="${INTENTIVE_ASSEMBLED_ACCEPTANCE_RESULT:-$REPO_ROOT/.context/desktop-assembled-acceptance.json}"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

run() {
  local label="$1"
  shift
  echo "==> $label"
  "$@"
}

run \
  "Omi-derived signed-artifact smoke contract" \
  "$MACOS_DIR/tests/test-signed-artifact-smoke.sh"

run \
  "Accessibility-addressed assembled Desktop journeys" \
  "$MACOS_DIR/scripts/swiftpm.sh" test \
    --package-path "$MACOS_DIR/Desktop" \
    --filter 'ScreenMemoryTimelineSmokeTests|FloatingConversationNativeTests|ProactiveEffectRunnerTests|DesktopOnboardingTests|DesktopUtilitySettingsTests|DesktopLaunchConfigurationTests'

run \
  "Assembled capture, sync, reconnect, expiry, and tombstone behavior" \
  "$MACOS_DIR/scripts/swiftpm.sh" test \
    --package-path "$MACOS_DIR/Desktop" \
    --filter 'ScreenMemoryArchiveTests.testAssembled|PerceptionSyncTests|DesktopRuntimeSessionTests|ScreenMemoryPrivacyAndExpiryTests'

run "Protocol contract and cross-language fixtures" pnpm --dir "$REPO_ROOT/packages/protocol" test

mkdir -p "$(dirname "$RESULT_JSON")"
RESULT_STARTED_AT="$STARTED_AT" \
  RESULT_FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  RESULT_GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)" \
  python3 - <<'PY' >"$RESULT_JSON"
import json
import os

print(json.dumps({
    "ok": True,
    "started_at": os.environ["RESULT_STARTED_AT"],
    "finished_at": os.environ["RESULT_FINISHED_AT"],
    "git_sha": os.environ["RESULT_GIT_SHA"],
    "journeys": [
        "timeline_search_open_scrub_render",
        "floating_text_conversation_close_reopen",
        "post_message_back_present_dismiss_snooze_acknowledge",
        "onboarding_permission_decisions_and_resume",
        "utility_settings_persistence_and_capture_policy",
        "capture_sync_reconnect_expiry_tombstone",
    ],
}, indent=2, sort_keys=True))
PY

echo "Assembled Desktop acceptance passed: $RESULT_JSON"
