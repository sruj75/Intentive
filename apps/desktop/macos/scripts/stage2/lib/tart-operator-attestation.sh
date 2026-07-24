collect_tart_operator_attestation() {
  local output="$1" evidence_dir="$2" run_id="$3" tag="$4" sha="$5" digest="$6" operator="$7"
  local post_step_callback="${8:-}"
  local -a titles=(
    "First launch and defer"
    "Permission denial"
    "Permission grant, capture, and audio"
    "Excluded application"
    "Retention and deletion"
    "Relaunch recovery"
    "Launch at login"
    "Post-Message-Back"
  )
  local -a instructions=(
    "In the Tart VM, verify the privacy explanation appears before any TCC prompt. Exercise Later/Skip, resume setup, and leave at least one Screen Recording or Microphone decision deferred before clicking Passed."
    "Exercise permission denial and leave at least one Screen Recording or Microphone decision denied before clicking Passed. Confirm the candidate degrades safely."
    "Grant Screen Recording, Microphone, and Accessibility and finish setup. Enable screen capture and ambient audio and keep both enabled. Show a normal window until Rewind has a local record, then speak until one local audio-memory record appears."
    "Add TextEdit to Excluded Apps and leave it excluded. Confirm capture pauses while TextEdit is frontmost."
    "Set retention to 3 days and leave it selected. Quit and reopen Settings and confirm the value persists."
    "Quit and relaunch Intentive. Leave it running with capture/audio enabled and confirm the settings recover."
    "Enable Launch at Login and leave it enabled. Complete a guest logout/login cycle, confirm no Dock/window flash, then use Open Intentive and confirm the Dock/window return."
    "Confirm the simulated proactive message auto-presents the Floating Bar. Reply through the real composer or deliberately ignore it; no dismiss or snooze control should appear."
  )

  for index in "${!titles[@]}"; do
    local number=$((index + 1))
    local response
    response="$(osascript - "${titles[$index]}" "${instructions[$index]}" <<'APPLESCRIPT'
on run argv
  set dialogResult to display dialog (item 2 of argv) with title ("Intentive Tart proof — " & item 1 of argv) buttons {"Abort proof", "Passed"} default button "Passed" cancel button "Abort proof" with icon caution
  return button returned of dialogResult
end run
APPLESCRIPT
)" || return 1
    [[ "$response" == "Passed" ]] || return 1
    /usr/sbin/screencapture -x "$evidence_dir/operator-step-$number.png"
    if [[ -n "$post_step_callback" ]]; then
      "$post_step_callback" "$number" || return 1
    fi
  done

  python3 - "$output" "$run_id" "$tag" "$sha" "$digest" "$operator" <<'PY'
import datetime, json, pathlib, sys
output, run_id, tag, sha, digest, operator = sys.argv[1:7]
pathlib.Path(output).write_text(json.dumps({
    "ok": True,
    "run_id": run_id,
    "release_tag": tag,
    "candidate_sha": sha,
    "dmg_sha256": digest,
    "operator": operator,
    "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "checks": {str(index): True for index in range(1, 9)},
}, indent=2, sort_keys=True) + "\n")
PY
}
