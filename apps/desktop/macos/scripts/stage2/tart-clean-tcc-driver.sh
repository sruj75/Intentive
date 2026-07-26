#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/write-proof.sh"
source "$SCRIPT_DIR/lib/compile-ax-probe.sh"
source "$SCRIPT_DIR/lib/tart-operator-attestation.sh"
fail() { echo "Tart clean-TCC proof failed: $*" >&2; exit 1; }
usage() {
  cat <<'EOF'
Usage: tart-clean-tcc-driver.sh --candidate-dmg PATH --release-tag TAG \
  --candidate-sha SHA --dmg-sha256 DIGEST --output JSON --evidence-root DIR

Required environment:
  TART_BASE_IMAGE          Immutable OCI reference pinned with @sha256:...
  DESKTOP_STAGE2_OPERATOR  Founder/operator identity recorded in the live attestation.
Optional:
  TART_HOME
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
[[ "$RELEASE_TAG" =~ ^desktop-v[0-9]+\.[0-9]+\.[0-9]+([+][0-9]+)?$ ]] || fail "invalid --release-tag"
[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "invalid --candidate-sha"
[[ "$DMG_SHA256" =~ ^[0-9a-f]{64}$ ]] || fail "invalid --dmg-sha256"
[[ -n "$OUTPUT" && -n "$EVIDENCE_ROOT" ]] || fail "--output and --evidence-root are required"
[[ "$(uname -m)" == "arm64" ]] || fail "Apple Silicon is required"
command -v tart >/dev/null 2>&1 || fail "tart is required"
command -v osascript >/dev/null 2>&1 || fail "osascript is required for live operator attestation"
BASE_IMAGE="${TART_BASE_IMAGE:-}"
[[ "$BASE_IMAGE" =~ ^[^[:space:]]+@sha256:[0-9a-f]{64}$ ]] \
  || fail "TART_BASE_IMAGE must be an immutable OCI reference pinned by sha256 digest"
OPERATOR="${DESKTOP_STAGE2_OPERATOR:-}"
[[ -n "$OPERATOR" ]] || fail "DESKTOP_STAGE2_OPERATOR is required"
SIGNING_IDENTITY="${DESKTOP_STAGE2_SIGNING_IDENTITY:-${SIGNING_IDENTITY:-}}"
[[ -n "$SIGNING_IDENTITY" ]] || fail "DESKTOP_STAGE2_SIGNING_IDENTITY is required"
RUN_ID="tart-stage2-$(date -u +%Y%m%dT%H%M%SZ)-$$"

EVIDENCE_DIR="$EVIDENCE_ROOT/tart-tcc"
rm -rf "$EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/intentive-tart-proof.XXXXXX")"
VM_NAME="intentive-stage2-${RANDOM}-$$"
RUN_PID="" PMB_PID="" APP_PID=""
cleanup() {
  [[ -n "$PMB_PID" ]] && kill "$PMB_PID" >/dev/null 2>&1 || true
  tart stop "$VM_NAME" >/dev/null 2>&1 || true
  tart delete "$VM_NAME" >/dev/null 2>&1 || true
  [[ -n "$RUN_PID" ]] && wait "$RUN_PID" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

compile_ax_probe \
  "$SCRIPT_DIR/TartAcceptanceProbe.swift" \
  "$WORK_DIR/TartAcceptanceProbe" \
  "$WORK_DIR/tart-probe"
xcrun swiftc \
  "$SCRIPT_DIR/TartStateInspector.swift" \
  -o "$WORK_DIR/TartStateInspector"
codesign --force --options runtime --timestamp \
  --identifier com.heyintentive.desktop.stage2-ax-probe \
  --sign "$SIGNING_IDENTITY" \
  "$WORK_DIR/TartAcceptanceProbe"
codesign --force --sign - "$WORK_DIR/TartStateInspector"
cp "$CANDIDATE_DMG" "$WORK_DIR/candidate.dmg"

tart pull "$BASE_IMAGE" >"$EVIDENCE_DIR/base-pull.log"
tart clone "$BASE_IMAGE" "$VM_NAME"
tart run \
  --dir="candidate:$WORK_DIR:ro" \
  --dir="evidence:$EVIDENCE_DIR" \
  "$VM_NAME" >"$EVIDENCE_DIR/vm.log" 2>&1 &
RUN_PID=$!

for _ in {1..90}; do
  if tart exec "$VM_NAME" /usr/bin/true >/dev/null 2>&1; then break; fi
  kill -0 "$RUN_PID" >/dev/null 2>&1 || fail "Tart VM stopped before its guest agent became ready"
  sleep 1
done
tart exec "$VM_NAME" /usr/bin/true >/dev/null 2>&1 || fail "Tart guest agent did not become ready"

tart exec "$VM_NAME" sh -c '
  set -eu
  mount_point="$(mktemp -d /tmp/intentive-dmg.XXXXXX)"
  hdiutil attach "$1" -nobrowse -readonly -mountpoint "$mount_point" -quiet
  app="$(find "$mount_point" -maxdepth 2 -name "*.app" -type d -print -quit)"
  test -d "$app"
  rm -rf /Applications/Intentive.app
  ditto "$app" /Applications/Intentive.app
  hdiutil detach "$mount_point" -quiet
  rmdir "$mount_point"
  codesign --verify --deep --strict --verbose=2 /Applications/Intentive.app
' sh "/Volumes/My Shared Files/candidate/candidate.dmg" \
  >"$EVIDENCE_DIR/install.log" 2>&1

HOST_GATEWAY="$(
  tart exec "$VM_NAME" sh -c \
    "/sbin/route -n get default 2>/dev/null | awk '/gateway:/{print \$2; exit}'"
)"
[[ "$HOST_GATEWAY" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  || fail "could not determine the Tart host gateway"
PMB_PORT=$((49152 + RANDOM % 12000))
"$SCRIPT_DIR/pmb-simulator.mjs" \
  --bind 0.0.0.0 --advertise-host "$HOST_GATEWAY" --port "$PMB_PORT" \
  --ack-timeout-ms 1800000 --output "$EVIDENCE_DIR/pmb-result.json" \
  >"$EVIDENCE_DIR/pmb-server.log" 2>&1 &
PMB_PID=$!
for _ in {1..100}; do
  grep -q '"control_plane_url"' "$EVIDENCE_DIR/pmb-server.log" 2>/dev/null && break
  kill -0 "$PMB_PID" >/dev/null 2>&1 || fail "PMB simulator failed to start"
  sleep 0.05
done

tart exec "$VM_NAME" sh -c '
  /usr/bin/env \
    INTENTIVE_RELEASE_ACCEPTANCE_MODE=1 \
    INTENTIVE_CONTROL_PLANE_URL="$2" \
    INTENTIVE_DESKTOP_USER_JWT=stage2-tart-user-jwt \
    /Applications/Intentive.app/Contents/MacOS/Intentive \
    >"$1" 2>&1 &
' sh \
  "/Volumes/My Shared Files/evidence/app.log" \
  "http://$HOST_GATEWAY:$PMB_PORT"

APP_PID=""
for _ in {1..100}; do
  APP_PID="$(tart exec "$VM_NAME" pgrep -n -f '^/Applications/Intentive.app/Contents/MacOS/Intentive( |$)' 2>/dev/null || true)"
  [[ -n "$APP_PID" ]] && break
  sleep 0.2
done
[[ -n "$APP_PID" ]] || fail "candidate did not launch inside Tart"

osascript - <<'APPLESCRIPT'
display dialog "In the Tart VM, open Privacy & Security > Accessibility and add the signed helper at /Volumes/My Shared Files/candidate/TartAcceptanceProbe. Enable only that helper; leave Intentive's own TCC grants untouched so the candidate still begins clean. Click Ready after the helper is trusted." with title "Intentive Tart automation preflight" buttons {"Abort proof", "Ready"} default button "Ready" cancel button "Abort proof" with icon caution
APPLESCRIPT
/usr/sbin/screencapture -x "$EVIDENCE_DIR/automation-preflight.png"

tart exec "$VM_NAME" \
  "/Volumes/My Shared Files/candidate/TartAcceptanceProbe" "$APP_PID" initial \
  "/Volumes/My Shared Files/evidence" "/Volumes/My Shared Files/evidence/initial-probe.json" \
  >"$EVIDENCE_DIR/initial-probe.log" 2>&1

verify_operator_step_state() {
  local number="$1"
  case "$number" in
    1|2)
      local label
      [[ "$number" == 1 ]] && label="defer" || label="denial"
      tart exec "$VM_NAME" \
        "/Volumes/My Shared Files/candidate/TartStateInspector" \
        >"$EVIDENCE_DIR/state-after-$label.json"
      tart exec "$VM_NAME" sh -c '
        sqlite3 "$HOME/Library/Application Support/com.apple.TCC/TCC.db" \
          "SELECT service, client, client_type, auth_value FROM access WHERE client = \"com.heyintentive.desktop\" ORDER BY service;"
      ' >"$EVIDENCE_DIR/tcc-after-$label.txt"
      python3 - "$EVIDENCE_DIR/state-after-$label.json" "$label" <<'PY'
import json, pathlib, sys
state = json.loads(pathlib.Path(sys.argv[1]).read_text())
label = sys.argv[2]
progress = state.get("onboarding_progress", {})
decisions = {
    progress.get("screenRecordingDecision"),
    progress.get("microphoneDecision"),
}
expected = "deferred" if label == "defer" else "denied"
if expected not in decisions:
    raise SystemExit(f"Tart onboarding did not persist a {expected} permission decision")
PY
      ;;
  esac
}

collect_tart_operator_attestation \
  "$EVIDENCE_DIR/operator-attestation.json" \
  "$EVIDENCE_DIR" \
  "$RUN_ID" \
  "$RELEASE_TAG" \
  "$CANDIDATE_SHA" \
  "$DMG_SHA256" \
  "$OPERATOR" \
  verify_operator_step_state \
  || fail "founder/operator aborted or failed the live Tart checklist"

# The operator journey must leave deterministic release state. Read the
# candidate's own preferences and archive directly in the guest instead of
# accepting clicks or screenshots as proof of the resulting configuration.
tart exec "$VM_NAME" \
  "/Volumes/My Shared Files/candidate/TartStateInspector" \
  >"$EVIDENCE_DIR/state-after-operator.json"
python3 - "$EVIDENCE_DIR/state-after-operator.json" <<'PY'
import json, pathlib, sys
state = json.loads(pathlib.Path(sys.argv[1]).read_text())
required_true = ("capture_enabled", "audio_enabled", "launch_at_login")
missing = [key for key in required_true if state.get(key) is not True]
if missing:
    raise SystemExit("Tart candidate state is not enabled: " + ", ".join(missing))
if state.get("retention_days") != 3:
    raise SystemExit("Tart retention is not 3 days")
if state.get("screen_record_count", 0) < 1:
    raise SystemExit("Tart journey produced no screen record")
if state.get("audio_record_count", 0) < 1:
    raise SystemExit("Tart journey produced no audio record")
exclusions = state.get("excluded_applications", [])
if not any(
    item.get("bundleID") == "com.apple.TextEdit"
    and item.get("displayName") == "TextEdit"
    for item in exclusions
):
    raise SystemExit("TextEdit is not excluded by its bundle identifier")
PY

# Prove the stored bundle-ID exclusion is enforced by the native capture path:
# keep TextEdit frontmost for several capture ticks and require that its record
# count remains unchanged.
tart exec "$VM_NAME" open -a TextEdit
tart exec "$VM_NAME" osascript -e 'tell application "TextEdit" to activate'
sleep 15
tart exec "$VM_NAME" \
  "/Volumes/My Shared Files/candidate/TartStateInspector" \
  >"$EVIDENCE_DIR/state-after-textedit.json"
python3 - "$EVIDENCE_DIR/state-after-operator.json" \
  "$EVIDENCE_DIR/state-after-textedit.json" <<'PY'
import json, pathlib, sys
before, after = [
    json.loads(pathlib.Path(path).read_text()) for path in sys.argv[1:3]
]
if after.get("textedit_record_count") != before.get("textedit_record_count"):
    raise SystemExit("TextEdit exclusion allowed a new captured record")
PY

# Positive control: move to a non-excluded app for the same observation window
# and require the archive to advance. This prevents a stalled capture loop from
# satisfying the TextEdit no-new-record assertion.
tart exec "$VM_NAME" open -a Finder
tart exec "$VM_NAME" osascript -e 'tell application "Finder" to activate'
sleep 15
tart exec "$VM_NAME" \
  "/Volumes/My Shared Files/candidate/TartStateInspector" \
  >"$EVIDENCE_DIR/state-after-positive-control.json"
python3 - "$EVIDENCE_DIR/state-after-textedit.json" \
  "$EVIDENCE_DIR/state-after-positive-control.json" <<'PY'
import json, pathlib, sys
excluded, control = [
    json.loads(pathlib.Path(path).read_text()) for path in sys.argv[1:3]
]
if control.get("screen_record_count", 0) <= excluded.get("screen_record_count", 0):
    raise SystemExit("capture positive control produced no new screen record")
if control.get("textedit_record_count") != excluded.get("textedit_record_count"):
    raise SystemExit("TextEdit record count changed during the positive control")
PY

# Relaunch mechanically, then re-read durable state. This is separate from the
# operator-observed relaunch and prevents a screenshot-only recovery claim.
tart exec "$VM_NAME" pkill -f '^/Applications/Intentive.app/Contents/MacOS/Intentive( |$)' \
  >/dev/null 2>&1 || true
tart exec "$VM_NAME" sh -c '
  /usr/bin/env \
    INTENTIVE_RELEASE_ACCEPTANCE_MODE=1 \
    INTENTIVE_CONTROL_PLANE_URL="$2" \
    INTENTIVE_DESKTOP_USER_JWT=stage2-tart-user-jwt \
    /Applications/Intentive.app/Contents/MacOS/Intentive \
    >>"$1" 2>&1 &
' sh \
  "/Volumes/My Shared Files/evidence/app.log" \
  "http://$HOST_GATEWAY:$PMB_PORT"
APP_PID=""
for _ in {1..100}; do
  APP_PID="$(tart exec "$VM_NAME" pgrep -n -f '^/Applications/Intentive.app/Contents/MacOS/Intentive( |$)' 2>/dev/null || true)"
  [[ -n "$APP_PID" ]] && break
  sleep 0.2
done
[[ -n "$APP_PID" ]] || fail "candidate did not recover after mechanical relaunch"
tart exec "$VM_NAME" \
  "/Volumes/My Shared Files/candidate/TartStateInspector" \
  >"$EVIDENCE_DIR/state-after-relaunch.json"
python3 - "$EVIDENCE_DIR/state-after-operator.json" \
  "$EVIDENCE_DIR/state-after-relaunch.json" <<'PY'
import json, pathlib, sys
before, after = [
    json.loads(pathlib.Path(path).read_text()) for path in sys.argv[1:3]
]
for key in ("capture_enabled", "audio_enabled", "retention_days", "launch_at_login"):
    if after.get(key) != before.get(key):
        raise SystemExit(f"Tart relaunch did not preserve {key}")
if not any(
    item.get("bundleID") == "com.apple.TextEdit"
    for item in after.get("excluded_applications", [])
):
    raise SystemExit("Tart relaunch did not preserve the TextEdit bundle-ID exclusion")
PY

# Preserve guest registration evidence from both launchd and Background Task
# Management. At least one system surface must resolve the bundled agent label.
GUEST_UID="$(tart exec "$VM_NAME" id -u)"
tart exec "$VM_NAME" launchctl print \
  "gui/$GUEST_UID/com.heyintentive.desktop.login-launcher-v1" \
  >"$EVIDENCE_DIR/launchagent-registration.txt" 2>&1 || true
tart exec "$VM_NAME" sfltool dumpbtm \
  >"$EVIDENCE_DIR/background-items.txt" 2>&1 || true
python3 - "$EVIDENCE_DIR/launchagent-registration.txt" \
  "$EVIDENCE_DIR/background-items.txt" <<'PY'
import pathlib, sys
evidence = "\n".join(pathlib.Path(path).read_text() for path in sys.argv[1:3])
if "com.heyintentive.desktop.login-launcher-v1" not in evidence:
    raise SystemExit("guest system state has no LaunchAgent/BTM registration evidence")
PY

APP_PID="$(tart exec "$VM_NAME" pgrep -n -f '^/Applications/Intentive.app/Contents/MacOS/Intentive( |$)' 2>/dev/null || true)"
[[ -n "$APP_PID" ]] || fail "candidate was not running after the operator journey"
tart exec "$VM_NAME" \
  "/Volumes/My Shared Files/candidate/TartAcceptanceProbe" "$APP_PID" final \
  "/Volumes/My Shared Files/evidence" "/Volumes/My Shared Files/evidence/final-probe.json" \
  >"$EVIDENCE_DIR/final-probe.log" 2>&1

tart exec "$VM_NAME" sh -c '
  sqlite3 "$HOME/Library/Application Support/com.apple.TCC/TCC.db" \
    "SELECT service, client, client_type, auth_value FROM access WHERE client LIKE \"%heyintentive%\" ORDER BY service, client;"
' >"$EVIDENCE_DIR/tcc-state.txt"
python3 - "$EVIDENCE_DIR/tcc-state.txt" <<'PY'
import pathlib, sys
rows = [line.split("|") for line in pathlib.Path(sys.argv[1]).read_text().splitlines()]
granted = {row[0] for row in rows if len(row) == 4 and row[1] == "com.heyintentive.desktop" and row[3] == "2"}
required = {"kTCCServiceScreenCapture", "kTCCServiceMicrophone"}
missing = sorted(required - granted)
if missing:
    raise SystemExit("operator journey did not leave required granted TCC rows: " + ", ".join(missing))
PY

for _ in {1..900}; do
  [[ -f "$EVIDENCE_DIR/pmb-result.json" ]] && break
  sleep 2
done
wait "$PMB_PID"
PMB_PID=""
python3 - "$EVIDENCE_DIR/initial-probe.json" "$EVIDENCE_DIR/final-probe.json" \
  "$EVIDENCE_DIR/operator-attestation.json" "$EVIDENCE_DIR/pmb-result.json" \
  "$RUN_ID" "$RELEASE_TAG" "$CANDIDATE_SHA" "$DMG_SHA256" <<'PY'
import json, pathlib, sys
initial, final, attestation, pmb = [
    json.loads(pathlib.Path(path).read_text()) for path in sys.argv[1:5]
]
run_id, tag, sha, digest = sys.argv[5:9]
if initial.get("ok") is not True or final.get("ok") is not True:
    raise SystemExit("Tart AX start/final-state probes failed")
if attestation.get("ok") is not True:
    raise SystemExit("Tart operator attestation failed")
if (attestation.get("run_id"), attestation.get("release_tag"),
    attestation.get("candidate_sha"), attestation.get("dmg_sha256")) != (run_id, tag, sha, digest):
    raise SystemExit("Tart operator attestation is not bound to this run")
if any(attestation.get("checks", {}).get(str(index)) is not True for index in range(1, 9)):
    raise SystemExit("Tart operator attestation is incomplete")
if pmb.get("ok") is not True or pmb.get("acked") is not True:
    raise SystemExit("Tart PMB delivery acknowledgement failed")
PY

write_proof_json "$OUTPUT" "$RELEASE_TAG" "$CANDIDATE_SHA" "$DMG_SHA256" \
  "$(python3 -c 'import json,sys; print(json.dumps({"run_id":sys.argv[1],"base_image":sys.argv[2],"operator":sys.argv[3],"automation":"Tart AX start/final probes plus live TCC state","operator_observation":True}))' "$RUN_ID" "$BASE_IMAGE" "$OPERATOR")" \
  "tart-tcc/operator-attestation.json" \
  "tart-tcc/operator-step-1.png" \
  "tart-tcc/operator-step-2.png" \
  "tart-tcc/operator-step-3.png" \
  "tart-tcc/operator-step-4.png" \
  "tart-tcc/operator-step-5.png" \
  "tart-tcc/operator-step-6.png" \
  "tart-tcc/operator-step-7.png" \
  "tart-tcc/operator-step-8.png" \
  "tart-tcc/install.log" \
  "tart-tcc/base-pull.log" \
  "tart-tcc/automation-preflight.png" \
  "tart-tcc/initial-probe.json" \
  "tart-tcc/initial-onboarding.png" \
  "tart-tcc/initial-onboarding-ax.json" \
  "tart-tcc/state-after-defer.json" \
  "tart-tcc/tcc-after-defer.txt" \
  "tart-tcc/state-after-denial.json" \
  "tart-tcc/tcc-after-denial.txt" \
  "tart-tcc/final-probe.json" \
  "tart-tcc/final-settings.png" \
  "tart-tcc/final-ax.json" \
  "tart-tcc/state-after-operator.json" \
  "tart-tcc/state-after-textedit.json" \
  "tart-tcc/state-after-positive-control.json" \
  "tart-tcc/state-after-relaunch.json" \
  "tart-tcc/launchagent-registration.txt" \
  "tart-tcc/background-items.txt" \
  "tart-tcc/tcc-state.txt" \
  "tart-tcc/pmb-result.json" \
  "tart-tcc/app.log" \
  "tart-tcc/vm.log"

echo "Tart clean-TCC proof passed: $OUTPUT"
