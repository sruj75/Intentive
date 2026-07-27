# ADR 0012: Privacy controls without a global Private Mode; PMB is reply-or-ignore

## Status

Accepted. Amended 2026-07-26 with the **Pause Coaching** whole-window action.
Supersedes the Private Mode clauses of ADR 0010 and the Private Mode references
in `ARCHITECTURE.md`, `PRIVACY.md`, and `RELEASE.md`.

## Context

Earlier Desktop framing carried a persistent global "Private Mode" switch that
paused screen, microphone, and system-audio sensing at once and flushed the
active video chunk until an explicit resume. During the native renovation that
mode was removed: no `PrivateMode` type or persisted setting remains. The
Desktop Performance Coach Preview now needs a process-scoped whole-window
boundary instead: **Pause Coaching** ends the current Coaching Window, and
**Resume Coaching** creates a new one.

Separately, Post-Message-Back (PMB) messages were once imagined with their own
dismiss/snooze affordances. The shipped Floating Bar has no such controls: a PMB
opens the one shared thread, and the user either replies or leaves it — the same
affordances as any other message.

This ADR records those two simplifications as intentional for the `0.1.1`
public release rather than as gaps to close.

## Decision

- **No persistent global Private Mode.** Capture and audio retain
  source-of-truth privacy controls:
  - macOS permission grants (Screen Recording, Microphone, System Audio), which
    fail closed when absent;
  - excluded-app exclusions;
  - retention windows (default seven days) with scheduled and launch-time expiry;
  - clear-all, which finalizes the active chunk and deletes local records.
- **One normal v1 Pause/Resume control.** The Preview does not expose
  independent screen, microphone, or system-audio enable switches. Pause ends
  the current Coaching Window and synchronously stops every source; Resume
  creates a new eligible window. Pause is process-scoped and is not restored
  after relaunch.
- **PMB is reply-or-ignore.** A Post-Message-Back presents the Floating Bar /
  edge glow and opens the shared thread. The user replies or ignores it. There
  is no separate dismiss or snooze control, and no duplicate macOS banner is
  emitted for an ordinary reply.

### Amendment — 2026-07-26: Pause Coaching ends the Coaching Window

The Desktop-only v1 product now has an explicit **Desktop Coaching Window**:
the Companion is present while the laptop and Desktop Client are active, then
steps out when that window ends. The User needs the same immediate authority
they would have with a human coach: one action that says "stop watching and
listening now."

- Add one **Pause Coaching** action that ends the current Desktop Coaching
  Window and synchronously stops screen, microphone, and system-audio
  perception.
- Only an explicit User action may resume coaching and begin another window.
- This does **not** restore the old persistent global `PrivateMode` setting and
  does not replace permission, exclusion, retention, or deletion controls.
- Remove the normal independent source-enable switches from v1 presentation.
  Internal desired-state seams may remain implementation details, but they do
  not independently authorize sensing outside an active Coaching Window.
- Post-Message-Back remains reply-or-ignore; Pause Coaching governs Companion
  presence and perception, not individual message dismissal.

## Consequences

- Stopping sensing means revoking a required macOS permission, ending the
  Desktop Coaching Window with **Pause Coaching**, or stopping the Desktop
  Client. Documentation must distinguish the ephemeral whole-window action from
  a persistent global Private Mode.
- ADR 0010's safety-gate list ("still pauses in Private Mode") is superseded on
  that clause only; the rest of ADR 0010 (passive audio on by default, consent-
  gated, no raw-audio retention, system audio `.onlyDuringMeetings`) stands.
- Acceptance and the clean-TCC Tart checklist assert Pause Coaching stops every
  active perception source, explicit resume begins a new Coaching Window,
  exclusion, retention, and clear-all still work, no independent normal source
  toggles remain, and PMB remains reply-or-ignore with no dismiss/snooze
  affordance.
- No user migration is required: there are no existing users, and no persisted
  Private Mode state to reconcile.
