# ADR 0012: Privacy controls without a global Private Mode; PMB is reply-or-ignore

## Status

Accepted. Supersedes the Private Mode clauses of ADR 0010 and the Private Mode
references in `ARCHITECTURE.md`, `PRIVACY.md`, and `RELEASE.md`.

## Context

Earlier Desktop framing carried a single global "Private Mode" switch that
paused screen, microphone, and system-audio sensing at once and flushed the
active video chunk until an explicit resume. During the native renovation the
global switch was removed from the shipping product: no `PrivateMode` type,
setting, or capture-lifecycle branch remains in source. The privacy guarantees
users actually rely on are already expressed through narrower, source-of-truth
controls, so a second global mode layered on top would be redundant surface with
its own failure modes.

Separately, Post-Message-Back (PMB) messages were once imagined with their own
dismiss/snooze affordances. The shipped Floating Bar has no such controls: a PMB
opens the one shared thread, and the user either replies or leaves it — the same
affordances as any other message.

This ADR records those two simplifications as intentional for the `0.1.1`
public release rather than as gaps to close.

## Decision

- **No global Private Mode.** There is no single switch that pauses all sensing.
  Capture and audio are governed by the controls that already exist and that a
  user can reason about individually:
  - macOS permission grants (Screen Recording, Microphone, System Audio), which
    fail closed when absent;
  - explicit per-source enable switches (Screen Memory capture, passive audio);
  - excluded-app exclusions;
  - retention windows (default seven days) with scheduled and launch-time expiry;
  - clear-all, which finalizes the active chunk and deletes local records.
- **PMB is reply-or-ignore.** A Post-Message-Back presents the Floating Bar /
  edge glow and opens the shared thread. The user replies or ignores it. There
  is no separate dismiss or snooze control, and no duplicate macOS banner is
  emitted for an ordinary reply.

## Consequences

- Stopping sensing means turning off the relevant source (or revoking its macOS
  permission), not toggling a mode. Documentation that described a global Private
  Mode is corrected to describe these per-source controls.
- ADR 0010's safety-gate list ("still pauses in Private Mode") is superseded on
  that clause only; the rest of ADR 0010 (passive audio on by default, consent-
  gated, no raw-audio retention, system audio `.onlyDuringMeetings`) stands.
- Acceptance and the clean-TCC Tart checklist assert per-source enable/disable,
  exclusion, retention, and clear-all behavior instead of a Private Mode step,
  and assert PMB reply-or-ignore with no dismiss/snooze affordance.
- No user migration is required: there are no existing users, and no persisted
  Private Mode state to reconcile.
