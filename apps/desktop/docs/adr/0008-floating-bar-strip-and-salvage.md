# ADR 0008: Floating control bar — minimal-diff restoration of Omi's real bar

## Status

Accepted for the minimal-diff restoration of Omi's real bar. Its dictation and subagent-compatibility behavior is superseded by [ADR 0009](0009-desktop-v1-surface-and-runtime-boundary.md). (Reverses an earlier draft of this ADR that argued for a "strip-and-salvage"
rebuild — see [Context](#context).)

## Context

The Desktop Client was forked from Omi. Omi's polished floating control bar — the
notch drop-down with `⌘O` chat, mic, and the purple push-to-talk waveform — is the
product surface we want, restored as-is.

An earlier version of this ADR argued the bar was too welded to dropped subsystems
(voice talk-back, subagent pills, streaming `currentAIMessage`, deleted god-objects)
to restore verbatim, and specified a **rebuild**: shelve Omi's real
`FloatingControlBarView.swift` / `FloatingControlBarWindow.swift`, swap the 699-line
`FloatingControlBarState` for a 37-line stub, put a plain `FloatingControlBarRootView`
(pill + card, no notch chrome, no glow) in front, and rebuild the menu bar as a SwiftUI
`MenuBarExtra`.

That premise was wrong, and the rebuild it produced was the amputation it feared.
Measuring our shelved copies against the pristine Omi clone showed the real View/Window
had only been **lightly trimmed** (~100–370 lines), never welded beyond salvage. The
actual damage was self-inflicted: the `State` brain was replaced and a plain bar built
in front. `MenuBarExtra`, in particular, re-made the exact mistake Omi's own code
comments say it rejected (`MenuBarExtra` renders unreliably on macOS Sequoia — status
items go "phantom").

This is a clone we are **polishing into Intentive with minimal surgical changes**, not
a ground-up rebuild. The guiding rule is: minimal diff from pristine Omi; adapt at the
seams, never edit UI to rebuild it; neutralize a dead subsystem at its boundary rather
than editing hundreds of view lines.

## Decision

Restore Omi's real bar with the **smallest possible diff**, and replace only the glue.

- **Un-shelve Omi's real files** and compile them live: `FloatingControlBarView.swift`,
  `FloatingControlBarWindow.swift`, `FloatingControlBarState.swift` (the full 699-line
  brain), `AskAIInputView.swift`, plus the leaf assets (theme, `VoiceWaveformBars`,
  `FloatingControlBarGeometry`, notch transition). No notch chrome is rebuilt.
- **Neutralize dropped subsystems at their boundary, not in the views.** A single
  compat shim (`IntentiveBarCompat.swift`) supplies inert stand-ins — subagent pills
  (`AgentPillsManager.pills` is always empty, so Omi's existing `pills.isEmpty`
  conditionals hide the agent surface naturally), voice playback (`isSpeaking = false`),
  composer attachments (`ChatAttachment.from(url:)` returns nil), and a text-only
  `ChatMessage`. The view code is left as-is; the dead surfaces render nothing because
  their data is empty.
- **Own only the Manager glue.** `FloatingControlBarManager` constructs Omi's real
  `FloatingControlBarWindow`, owns the `⌘O` Carbon hotkey and the
  `FloatingBarOverlaySink` nudge bridge, and is the single seam the app talks to
  (`show` / `toggleAIInput` / `hide` / `refreshMessages` / `receiveDictation` /
  `showNudge`). It wires the window's callback closures to Core:
  - **Send:** `onSendQuery` → Core `FloatingBarController.submit(_:)`. Omi's
    `beginVisibleMainQuery` already shows the question + spinner before bubbling up.
  - **Receive:** `refreshMessages()` binds the companion's reply via the state's
    `setLocalAnswerOverride` (plain text, no provider streaming) and stops the spinner.
  - **Dictation:** `receiveDictation(_:)` stages a transcript in the composer and never
    sends (ADR-0007). It is *pushed* from the app's global push-to-talk monitor; the
    pure `DictationComposer.merge` owns the "fill, don't send" text rule.
- **Restore the real menu bar.** `IntentiveAppDelegate` owns an `NSStatusItem` + `NSMenu`
  (Screen Capture, Ambient Capture, Open, Reset Onboarding, Sign Out, Quit), rebuilt on
  open to track live model state. The SwiftUI `MenuBarExtra` is removed.
- **Delete the rebuild artifacts:** `FloatingControlBarSession.swift`,
  `FloatingControlBarRootView.swift`, and the 37-line `FloatingControlBarState` stub.

Branding is out of scope (deferred to a future revamp): Omi's 8-dot notch ring, app
icon, and menu glyph are kept as neutral placeholders (`OmiThinkingMark` renders a plain
spinner; the status item uses `waveform.circle`).

## Consequences

- The bar is Omi's real, polished chrome — notch drop-down, glow, waveform — not a plain
  stand-in. Restoration was a minimal diff plus a boundary shim, not view surgery.
- The dropped subsystems (subagent pills, voice playback, attachments) are **inert, not
  deleted.** They compile against the compat shim and render nothing. Reviving one is a
  deliberate feature (swap the stub for a real implementation), and removing the now-dead
  agent subviews is deferred — deleting inert-but-woven view code buys nothing visible and
  is pure risk against the guiding rule.
- The full `FloatingControlBarState` is live again, so its unit suites
  (`FloatingControlBarStateTests`, `FloatingBarGeometryTests`) are restored to the build.
- The menu bar uses `NSStatusBar`, matching Omi's own rejection of `MenuBarExtra` on
  Sequoia.
- The `⌘O` global hotkey is a fixed Carbon registration owned by the Manager; Omi's
  configurable `ShortcutSettings` is not carried.
