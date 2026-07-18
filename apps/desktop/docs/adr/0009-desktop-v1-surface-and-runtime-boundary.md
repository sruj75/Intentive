# ADR 0009: Desktop v1 surface and Runtime boundary

## Status

Accepted. Supersedes ADR 0003, ADR 0007, and the dictation/subagent portions of ADR 0008.

## Context

The first SwiftPM replacement assembled a utility window, a second chat surface, local RunAnywhere dictation, and a Post-Message-Back path that showed both a macOS notification and the floating bar. That made the Desktop Client behave like a separate assistant rather than the native senses and interface of the one Companion.

Omi's native floating-bar chrome and archived sensing subsystems remain valuable renovation assets. Their original provider-key, local-brain, voice-input, and subagent product assumptions do not belong in Intentive.

## Decision

- The Agent Runtime is the only Companion brain. Provider credentials, model routing, and intervention judgment do not live on the Mac.
- The Floating Bar is the only Desktop conversation surface. Conversation input and replies are text only; there is no dictation, push-to-talk, TTS, tool-call UI, or subagent UI.
- The main window is utility-only. During the renovation walking skeleton it provides Home, Screen Memory, and Settings, with setup routed to Settings until the renovated Omi onboarding is activated.
- Omi's real floating window, notch geometry, composer, response chrome, Carbon shortcut, and status-item mechanism are adapted at their boundaries rather than rebuilt.
- Passive microphone and system-audio sensing is separate from conversation input. The local Omi-derived pipeline shipped in Slice 8 and is on by default as of ADR-0010; see that ADR for the consent posture. The legacy RunAnywhere path does not warm up or start.
- Raw screenshots, recordings, thumbnails, and audio remain local in v1. Only compact text and metadata perception records may be synchronized.
- A proactive Desktop presentation is triggered only by `companion_message.via_post_message_back == true`. It uses the floating bar and approved contextual overlays. Ordinary replies update the conversation without re-presenting it, and Intentive does not emit a duplicate product macOS notification.
- `DesktopLaunchConfiguration` is the immutable executable composition seam. Production construction is explicit. Deterministic assembled scenarios inject isolated profile roots and fixed permission/auth/runtime state while disabling capture, network, updates, and telemetry at their system boundaries.

## Consequences

- Voice-era code may remain compiled temporarily as an inert renovation asset, but the assembled surface and startup path cannot expose or start it. Broad deletion belongs to the final strangler cleanup slice.
- The current simplified onboarding is not presented. Setup remains usable through the utility window until the Omi onboarding renovation slice replaces it.
- Sparkle, telemetry, Screen Memory archive restoration, and wider settings renovation retain their own slices; this ADR fixes their boundaries without implementing them early. Passive audio's default posture is settled by ADR-0010.
