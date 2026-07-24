#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/write-proof.sh"
source "$SCRIPT_DIR/lib/compile-ax-probe.sh"
fail() { echo "Full-stack signed-in proof failed: $*" >&2; exit 1; }
usage() {
  cat <<'EOF'
Usage: full-stack-signed-in-driver.sh --candidate-dmg PATH --release-tag TAG \
  --candidate-sha SHA --dmg-sha256 DIGEST --output JSON --evidence-root DIR

Required environment:
  INTENTIVE_NEON_AUTH_URL
  INTENTIVE_CONTROL_PLANE_URL
  DESKTOP_RELEASE_TEST_ACCOUNT_EMAIL
  DESKTOP_RELEASE_TEST_ACCOUNT_PASSWORD
  DESKTOP_RELEASE_TEST_USER_ID
  DESKTOP_RELEASE_TEST_CLEANUP_RECEIPT

The operating agent must follow apps/desktop/docs/RELEASE.md through Neon MCP
and write the run-bound cleanup receipt. The EXIT trap waits for and validates
that receipt after every production-touching attempt, including failed proofs.
EOF
}

CANDIDATE_DMG="" RELEASE_TAG="" CANDIDATE_SHA="" DMG_SHA256="" OUTPUT="" EVIDENCE_ROOT=""
while (($#)); do
  case "$1" in
    --candidate-dmg) CANDIDATE_DMG="${2:-}"; shift 2 ;;
    --release-tag) RELEASE_TAG="${2:-}"; shift 2 ;;
    --candidate-sha) CANDIDATE_SHA="${2:-}"; shift 2 ;;
    --dmg-sha256) DMG_SHA256="${2:-}"; shift 2 ;;
    --output) OUTPUT="${2:-}"; shift 2 ;;
    --evidence-root) EVIDENCE_ROOT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -f "$CANDIDATE_DMG" ]] || fail "--candidate-dmg is missing"
[[ "$RELEASE_TAG" =~ ^desktop-v[0-9]+\.[0-9]+\.[0-9]+([+][0-9]+)?$ ]] \
  || fail "invalid --release-tag"
[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "invalid --candidate-sha"
[[ "$DMG_SHA256" =~ ^[0-9a-f]{64}$ ]] || fail "invalid --dmg-sha256"
[[ -n "$OUTPUT" && -n "$EVIDENCE_ROOT" ]] || fail "--output and --evidence-root are required"
for variable in \
  INTENTIVE_NEON_AUTH_URL \
  INTENTIVE_CONTROL_PLANE_URL \
  DESKTOP_RELEASE_TEST_ACCOUNT_EMAIL \
  DESKTOP_RELEASE_TEST_ACCOUNT_PASSWORD \
  DESKTOP_RELEASE_TEST_USER_ID \
  DESKTOP_RELEASE_TEST_CLEANUP_RECEIPT; do
  [[ -n "${!variable:-}" ]] || fail "$variable is required"
done
[[ "$DESKTOP_RELEASE_TEST_USER_ID" =~ ^[A-Za-z0-9._-]+$ ]] \
  || fail "DESKTOP_RELEASE_TEST_USER_ID contains unsafe path characters"
[[ "$DESKTOP_RELEASE_TEST_USER_ID" != "anonymous" ]] \
  || fail "the release-test account cannot use the anonymous profile"

INSTALLED_APP="/Applications/Intentive.app"
[[ -d "$INSTALLED_APP" ]] \
  || fail "candidate must already be installed by run-stage2-release-proof.sh"
codesign --verify --deep --strict --verbose=2 "$INSTALLED_APP"

EVIDENCE_DIR="$EVIDENCE_ROOT/full-stack"
rm -rf "$EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/intentive-full-stack.XXXXXX")"
APP_PID="" PMB_PID="" MARKER_PID=""
KEYCHAIN_SERVICE="com.heyintentive.desktop.auth"
KEYCHAIN_ACCOUNT="neon-user-jwt"
HAD_OLD_TOKEN=0 OLD_TOKEN=""
PROFILE_DIR="$HOME/Library/Application Support/Intentive/users/$DESKTOP_RELEASE_TEST_USER_ID"
DATABASE="$PROFILE_DIR/intentive.db"
RUN_ID="desktop-stage2-$(date -u +%Y%m%dT%H%M%SZ)-$$"
MARKER="INTENTIVE_RELEASE_${RUN_ID//[^A-Za-z0-9]/_}"
PRODUCTION_TOUCHED=0
CLEANUP_VERIFIED=0
marker_count=0
remaining=1
rm -f "$DESKTOP_RELEASE_TEST_CLEANUP_RECEIPT"

if OLD_TOKEN="$(security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w 2>/dev/null)"; then
  HAD_OLD_TOKEN=1
fi

validate_cleanup_receipt() {
  [[ -f "$DESKTOP_RELEASE_TEST_CLEANUP_RECEIPT" ]] || return 1
  python3 - "$DESKTOP_RELEASE_TEST_CLEANUP_RECEIPT" \
    "$DESKTOP_RELEASE_TEST_USER_ID" "$RUN_ID" "$MARKER" <<'PY'
import json, pathlib, sys
receipt = json.loads(pathlib.Path(sys.argv[1]).read_text())
expected_user, expected_run, expected_marker = sys.argv[2:5]
if receipt.get("ok") is not True:
    raise SystemExit("cleanup receipt does not report success")
if (receipt.get("user_id"), receipt.get("run_id"), receipt.get("release_marker")) != (
    expected_user, expected_run, expected_marker
):
    raise SystemExit("cleanup receipt identity does not match this proof run")
required = (
    "schema_inspected",
    "auth_identity_preserved",
    "observed_perception_event",
    "observed_privacy_filtered_perception",
    "observed_retention_tombstone",
    "verified_generated_rows_zero",
)
missing = [key for key in required if receipt.get(key) is not True]
if missing:
    raise SystemExit("cleanup receipt lacks required evidence: " + ", ".join(missing))
PY
}

await_production_cleanup() {
  echo "Production cleanup required for user $DESKTOP_RELEASE_TEST_USER_ID" >&2
  echo "run_id=$RUN_ID release_marker=$MARKER" >&2
  echo "Follow apps/desktop/docs/RELEASE.md through Neon MCP and write:" >&2
  echo "$DESKTOP_RELEASE_TEST_CLEANUP_RECEIPT" >&2
  local timeout_seconds="${DESKTOP_RELEASE_TEST_CLEANUP_TIMEOUT_SECONDS:-1800}"
  local elapsed
  for ((elapsed = 0; elapsed < timeout_seconds; elapsed += 2)); do
    if validate_cleanup_receipt; then
      CLEANUP_VERIFIED=1
      return 0
    fi
    sleep 2
  done
  return 1
}

cleanup() {
  local original_status=$?
  trap - EXIT
  [[ -n "$PMB_PID" ]] && kill "$PMB_PID" >/dev/null 2>&1 || true
  [[ -n "$MARKER_PID" ]] && kill "$MARKER_PID" >/dev/null 2>&1 || true
  [[ -n "$APP_PID" ]] && kill "$APP_PID" >/dev/null 2>&1 || true
  pkill -f '^/Applications/Intentive.app/Contents/MacOS/Intentive( |$)' >/dev/null 2>&1 || true
  security delete-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" \
    >/dev/null 2>&1 || true
  if [[ "$HAD_OLD_TOKEN" == 1 ]]; then
    security add-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" \
      -w "$OLD_TOKEN" -U >/dev/null
  fi
  if [[ -d "$PROFILE_DIR" ]]; then
    rm -rf -- "$PROFILE_DIR"
  fi
  rm -rf "$WORK_DIR"

  local cleanup_status=0
  if [[ "$PRODUCTION_TOUCHED" == 1 && "$CLEANUP_VERIFIED" == 0 ]]; then
    await_production_cleanup || cleanup_status=1
  fi
  if [[ "$original_status" -ne 0 || "$cleanup_status" -ne 0 ]]; then
    exit 1
  fi
}
trap cleanup EXIT

JWT="$("$SCRIPT_DIR/mint-release-test-jwt.mjs")"
[[ "$JWT" == *.*.* ]] || fail "mint helper did not return a JWT"
PRODUCTION_TOUCHED=1
security add-generic-password \
  -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w "$JWT" -U >/dev/null

compile_ax_probe "$SCRIPT_DIR/FullStackProbe.swift" "$WORK_DIR/FullStackProbe" \
  "$WORK_DIR/full-stack-probe"

start_production_app() {
  /usr/bin/env \
    INTENTIVE_DESKTOP_USER_JWT="$JWT" \
    INTENTIVE_CONTROL_PLANE_URL="$INTENTIVE_CONTROL_PLANE_URL" \
    "$INSTALLED_APP/Contents/MacOS/Intentive" \
    >>"$EVIDENCE_DIR/production-app.log" 2>&1 &
  APP_PID=$!
  for _ in {1..100}; do
    kill -0 "$APP_PID" >/dev/null 2>&1 && return 0
    sleep 0.1
  done
  return 1
}

start_production_app || fail "signed candidate did not launch"
"$WORK_DIR/FullStackProbe" "$APP_PID" prepare-capture unused "$EVIDENCE_DIR" \
  "$EVIDENCE_DIR/capture-enabled.json" >"$EVIDENCE_DIR/capture-enable-probe.log" 2>&1

osascript - "$MARKER" <<'APPLESCRIPT' &
on run argv
  display dialog (item 1 of argv) with title "Intentive release capture proof" buttons {"Keep Visible"} default button "Keep Visible" giving up after 180
end run
APPLESCRIPT
MARKER_PID=$!

for _ in {1..300}; do
  if [[ -f "$DATABASE" ]]; then
    marker_count="$(
      sqlite3 "$DATABASE" \
        "SELECT count(*) FROM screen_memory_records WHERE instr(ocr_text, '$MARKER') > 0;" \
        2>/dev/null || true
    )"
    [[ "${marker_count:-0}" -gt 0 ]] && break
  fi
  sleep 1
done
[[ "${marker_count:-0}" -gt 0 ]] \
  || fail "real capture/OCR did not persist the release marker"
kill "$MARKER_PID" >/dev/null 2>&1 || true
MARKER_PID=""

"$WORK_DIR/FullStackProbe" "$APP_PID" stop-capture unused "$EVIDENCE_DIR" \
  "$EVIDENCE_DIR/capture-disabled.json" >"$EVIDENCE_DIR/capture-disable-probe.log" 2>&1
for _ in {1..60}; do
  sqlite3 -json "$DATABASE" \
    "SELECT records.id, records.ocr_text, records.sensitivity_label, records.expires_at,
            frames.chunk_id, chunks.state
     FROM screen_memory_records AS records
     JOIN screen_memory_video_frames AS frames ON frames.record_id = records.id
     JOIN screen_memory_video_chunks AS chunks ON chunks.chunk_id = frames.chunk_id
     WHERE instr(records.ocr_text, '$MARKER') > 0;" \
    >"$EVIDENCE_DIR/local-capture-archive.json"
  if python3 - "$EVIDENCE_DIR/local-capture-archive.json" <<'PY'
import json, pathlib, sys
rows = json.loads(pathlib.Path(sys.argv[1]).read_text())
raise SystemExit(0 if rows and all(row.get("state") == "finalized" for row in rows) else 1)
PY
  then
    break
  fi
  sleep 1
done
python3 - "$EVIDENCE_DIR/local-capture-archive.json" "$MARKER" <<'PY'
import json, pathlib, sys
rows = json.loads(pathlib.Path(sys.argv[1]).read_text())
marker = sys.argv[2]
if not rows or not any(marker in row.get("ocr_text", "") for row in rows):
    raise SystemExit("local OCR/archive evidence does not contain the marker")
if not all(row.get("chunk_id") and row.get("state") == "finalized" for row in rows):
    raise SystemExit("captured marker is not in a finalized local archive chunk")
PY

"$WORK_DIR/FullStackProbe" "$APP_PID" search-chat "$MARKER" "$EVIDENCE_DIR" \
  "$EVIDENCE_DIR/runtime-search.json" >"$EVIDENCE_DIR/chat-probe.log" 2>&1

kill "$APP_PID" >/dev/null 2>&1 || true
wait "$APP_PID" >/dev/null 2>&1 || true
APP_PID=""
sqlite3 "$DATABASE" \
  "UPDATE screen_memory_records
   SET expires_at = '2000-01-01T00:00:00.000Z'
   WHERE instr(ocr_text, '$MARKER') > 0;"
start_production_app || fail "candidate did not relaunch for retention expiry"
for _ in {1..180}; do
  remaining="$(
    sqlite3 "$DATABASE" \
      "SELECT count(*) FROM screen_memory_records WHERE instr(ocr_text, '$MARKER') > 0;" \
      2>/dev/null || true
  )"
  [[ "${remaining:-1}" == 0 ]] && break
  sleep 1
done
[[ "${remaining:-1}" == 0 ]] || fail "retention expiry did not remove the captured marker"
sqlite3 -json "$DATABASE" \
  "SELECT ingress_kind, ingress_id, payload_json, enqueued_at
   FROM runtime_ingress_outbox ORDER BY seq;" \
  >"$EVIDENCE_DIR/post-expiry-outbox.json"

kill "$APP_PID" >/dev/null 2>&1 || true
wait "$APP_PID" >/dev/null 2>&1 || true
APP_PID=""

PMB_PORT=$((49152 + RANDOM % 12000))
"$SCRIPT_DIR/pmb-simulator.mjs" \
  --port "$PMB_PORT" --message-id "$RUN_ID-pmb" \
  --user-id "$DESKTOP_RELEASE_TEST_USER_ID" --ack-timeout-ms 30000 \
  --output "$EVIDENCE_DIR/pmb-result.json" \
  >"$EVIDENCE_DIR/pmb-server.log" 2>&1 &
PMB_PID=$!
for _ in {1..100}; do
  grep -q '"control_plane_url"' "$EVIDENCE_DIR/pmb-server.log" 2>/dev/null && break
  kill -0 "$PMB_PID" >/dev/null 2>&1 || fail "PMB simulator failed to start"
  sleep 0.05
done

/usr/bin/env \
  INTENTIVE_RELEASE_ACCEPTANCE_MODE=1 \
  INTENTIVE_DESKTOP_USER_JWT=stage2-local-pmb-jwt \
  INTENTIVE_CONTROL_PLANE_URL="http://127.0.0.1:$PMB_PORT" \
  "$INSTALLED_APP/Contents/MacOS/Intentive" \
  >"$EVIDENCE_DIR/pmb-app.log" 2>&1 &
APP_PID=$!
wait "$PMB_PID"
PMB_PID=""
python3 - "$EVIDENCE_DIR/runtime-search.json" "$EVIDENCE_DIR/pmb-result.json" "$MARKER" <<'PY'
import json, pathlib, sys
search = json.loads(pathlib.Path(sys.argv[1]).read_text())
pmb = json.loads(pathlib.Path(sys.argv[2]).read_text())
marker = sys.argv[3]
if search.get("ok") is not True or search.get("runtime_search_confirmed") is not True:
    raise SystemExit("production Runtime search round trip failed")
if marker not in search.get("reply", ""):
    raise SystemExit("Runtime search response did not contain the captured marker")
if pmb.get("ok") is not True or pmb.get("acked") is not True:
    raise SystemExit("local PMB receive/ack proof failed")
PY

await_production_cleanup || fail "adaptive Neon cleanup was not verified"
cp "$DESKTOP_RELEASE_TEST_CLEANUP_RECEIPT" "$EVIDENCE_DIR/neon-cleanup-receipt.json"

write_proof_json "$OUTPUT" "$RELEASE_TAG" "$CANDIDATE_SHA" "$DMG_SHA256" \
  "$(python3 -c 'import json,sys; print(json.dumps({"run_id":sys.argv[1],"release_test_user_id":sys.argv[2],"release_marker":sys.argv[3]}))' "$RUN_ID" "$DESKTOP_RELEASE_TEST_USER_ID" "$MARKER")" \
  "full-stack/production-app.log" \
  "full-stack/capture-enabled.json" \
  "full-stack/capture-enabled.png" \
  "full-stack/local-capture-archive.json" \
  "full-stack/runtime-search.json" \
  "full-stack/chat-round-trip.png" \
  "full-stack/post-expiry-outbox.json" \
  "full-stack/pmb-result.json" \
  "full-stack/neon-cleanup-receipt.json"

echo "Full-stack signed-in proof passed: $OUTPUT"
