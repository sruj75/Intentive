#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: run-stage2-release-proof.sh --dmg PATH --appcast PATH --tag TAG --sha SHA --output DIR

Runs fresh Stage 2 proof on the dedicated release Mac. The workflow resolves
the three repository-owned drivers named below from GITHUB_WORKSPACE. They must
write their requested JSON plus referenced evidence files into the fresh output
directory:

  DESKTOP_STAGE2_SPARKLE_DRIVER
  DESKTOP_STAGE2_TART_DRIVER
  DESKTOP_STAGE2_FULL_STACK_DRIVER
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail() { echo "Stage 2 proof failed: $*" >&2; exit 1; }

DMG=""
APPCAST=""
RELEASE_TAG=""
CANDIDATE_SHA=""
OUTPUT_DIR=""
while (($#)); do
  case "$1" in
    --dmg) DMG="${2:-}"; shift 2 ;;
    --appcast) APPCAST="${2:-}"; shift 2 ;;
    --tag) RELEASE_TAG="${2:-}"; shift 2 ;;
    --sha) CANDIDATE_SHA="${2:-}"; shift 2 ;;
    --output) OUTPUT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -f "$DMG" ]] || fail "candidate DMG is missing"
[[ -f "$APPCAST" ]] || fail "candidate appcast is missing"
[[ "$RELEASE_TAG" == desktop-v* ]] || fail "invalid release tag"
[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "candidate SHA must be full length"
[[ -n "$OUTPUT_DIR" && "$OUTPUT_DIR" != "/" ]] || fail "invalid output directory"
if [[ -n "${RUNNER_TEMP:-}" && "$OUTPUT_DIR" != "$RUNNER_TEMP"/* ]]; then
  fail "output directory must be inside RUNNER_TEMP"
fi

for variable in \
  DESKTOP_STAGE2_SPARKLE_DRIVER \
  DESKTOP_STAGE2_TART_DRIVER \
  DESKTOP_STAGE2_FULL_STACK_DRIVER; do
  driver="${!variable:-}"
  [[ -x "$driver" ]] || fail "$variable must name an executable dedicated-Mac driver"
done

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
DMG_SHA256="$(shasum -a 256 "$DMG" | awk '{print $1}')"
MOUNT_POINT="$(mktemp -d "${TMPDIR:-/tmp}/intentive-stage2-mount.XXXXXX")"
BACKUP_APP=""
INSTALLED_APP="/Applications/Intentive.app"

cleanup() {
  hdiutil detach "$MOUNT_POINT" -quiet >/dev/null 2>&1 || true
  if [[ -n "$BACKUP_APP" && -d "$BACKUP_APP" ]]; then
    rm -rf "$INSTALLED_APP"
    mv "$BACKUP_APP" "$INSTALLED_APP"
  fi
  rmdir "$MOUNT_POINT" >/dev/null 2>&1 || true
}
trap cleanup EXIT

hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MOUNT_POINT" -quiet
CANDIDATE_APP="$(find "$MOUNT_POINT" -maxdepth 2 -name '*.app' -type d -print -quit)"
[[ -d "$CANDIDATE_APP" ]] || fail "DMG contains no app bundle"
if [[ -e "$INSTALLED_APP" ]]; then
  BACKUP_APP="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/Intentive.pre-stage2.$RANDOM.app"
  mv "$INSTALLED_APP" "$BACKUP_APP"
fi
ditto "$CANDIDATE_APP" "$INSTALLED_APP"
codesign --verify --deep --strict --verbose=2 "$INSTALLED_APP"
spctl --assess --type execute --verbose=2 "$INSTALLED_APP"
xcrun stapler validate "$DMG"
open -n -F "$INSTALLED_APP"
for _ in {1..100}; do
  pgrep -f '^/Applications/Intentive.app/Contents/MacOS/Intentive( |$)' >/dev/null && break
  sleep 0.1
done
pgrep -f '^/Applications/Intentive.app/Contents/MacOS/Intentive( |$)' >/dev/null \
  || fail "installed candidate did not launch"
pkill -f '^/Applications/Intentive.app/Contents/MacOS/Intentive( |$)' >/dev/null 2>&1 || true

mkdir -p "$OUTPUT_DIR/installed-dmg"
codesign -dv --verbose=4 "$INSTALLED_APP" 2>"$OUTPUT_DIR/installed-dmg/codesign.txt"
spctl --assess --type execute --verbose=4 "$INSTALLED_APP" \
  >"$OUTPUT_DIR/installed-dmg/gatekeeper.txt" 2>&1
python3 - "$OUTPUT_DIR/installed-dmg.json" "$RELEASE_TAG" "$CANDIDATE_SHA" "$DMG_SHA256" <<'PY'
import json, pathlib, sys
path, tag, sha, digest = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
path.write_text(json.dumps({
    "ok": True,
    "release_tag": tag,
    "candidate_sha": sha,
    "dmg_sha256": digest,
    "evidence_files": ["installed-dmg/codesign.txt", "installed-dmg/gatekeeper.txt"],
}, indent=2, sort_keys=True) + "\n")
PY

# Launch-at-login proof against the freshly installed, signed artifact (ADR 0011).
# Repository-owned; the interactive login cycle is operator-observed and recorded
# alongside the JSON this emits.
"$SCRIPT_DIR/verify-launch-at-login.sh" \
  --app "$INSTALLED_APP" --output "$OUTPUT_DIR/launch-at-login.json" \
  --evidence-root "$OUTPUT_DIR" --release-tag "$RELEASE_TAG" \
  --candidate-sha "$CANDIDATE_SHA" --dmg-sha256 "$DMG_SHA256"

"$DESKTOP_STAGE2_SPARKLE_DRIVER" \
  --candidate-dmg "$DMG" --appcast "$APPCAST" --release-tag "$RELEASE_TAG" \
  --candidate-sha "$CANDIDATE_SHA" --dmg-sha256 "$DMG_SHA256" \
  --output "$OUTPUT_DIR/sparkle-update.json" --evidence-root "$OUTPUT_DIR"
"$DESKTOP_STAGE2_TART_DRIVER" \
  --candidate-dmg "$DMG" --release-tag "$RELEASE_TAG" --candidate-sha "$CANDIDATE_SHA" \
  --dmg-sha256 "$DMG_SHA256" --output "$OUTPUT_DIR/tart-tcc.json" \
  --evidence-root "$OUTPUT_DIR"
"$DESKTOP_STAGE2_FULL_STACK_DRIVER" \
  --candidate-dmg "$DMG" --release-tag "$RELEASE_TAG" --candidate-sha "$CANDIDATE_SHA" \
  --dmg-sha256 "$DMG_SHA256" --output "$OUTPUT_DIR/full-stack.json" \
  --evidence-root "$OUTPUT_DIR"

python3 - "$OUTPUT_DIR" "$RELEASE_TAG" "$CANDIDATE_SHA" "$DMG_SHA256" <<'PY'
import json, pathlib, sys
root, tag, sha, digest = pathlib.Path(sys.argv[1]).resolve(), sys.argv[2], sys.argv[3], sys.argv[4]
for name in ("installed-dmg.json", "launch-at-login.json", "sparkle-update.json", "tart-tcc.json", "full-stack.json"):
    path = root / name
    proof = json.loads(path.read_text())
    if proof.get("ok") is not True:
        raise SystemExit(f"proof failed: {name}")
    if (proof.get("release_tag"), proof.get("candidate_sha"), proof.get("dmg_sha256")) != (tag, sha, digest):
        raise SystemExit(f"proof identity mismatch: {name}")
    evidence = proof.get("evidence_files") or []
    if not evidence:
        raise SystemExit(f"proof has no evidence: {name}")
    for item in evidence:
        candidate = (root / item).resolve()
        if root not in candidate.parents or not candidate.is_file():
            raise SystemExit(f"invalid proof attachment in {name}: {item}")
PY

echo "Fresh Stage 2 proof passed: $OUTPUT_DIR"
