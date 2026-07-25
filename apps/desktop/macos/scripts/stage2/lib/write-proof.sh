# Shared JSON writer for the three DESKTOP_STAGE2_*_DRIVER scripts
# (apps/desktop/docs/RELEASE.md). Keeps the {"ok", "release_tag",
# "candidate_sha", "dmg_sha256", "evidence_files"} shape identical across
# drivers instead of three hand-rolled python3 heredocs.
#
# Usage: write_proof_json OUTPUT TAG SHA DIGEST EXTRA_JSON EVIDENCE_FILE...
#   EXTRA_JSON is a JSON object string merged into the payload (pass "{}" for
#   none); driver-specific fields like n1_release_tag go there.

write_proof_json() {
  local output="$1" tag="$2" sha="$3" digest="$4" extra_json="$5"
  shift 5
  python3 - "$output" "$tag" "$sha" "$digest" "$extra_json" "$@" <<'PY'
import json, pathlib, sys
output, tag, sha, digest, extra_json = sys.argv[1:6]
evidence_files = sys.argv[6:]
payload = json.loads(extra_json)
payload.update({
    "ok": True,
    "release_tag": tag,
    "candidate_sha": sha,
    "dmg_sha256": digest,
    "evidence_files": evidence_files,
})
pathlib.Path(output).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
PY
}
