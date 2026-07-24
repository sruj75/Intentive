# ADR 0007: Text-first Companion; the mic is on-device dictation

## Status

Superseded by [ADR 0009](0009-desktop-v1-surface-and-runtime-boundary.md). This ADR remains as history for the removed RunAnywhere dictation direction.

## Context

An earlier revision of this ADR accepted a bidirectional voice loop: the Companion spoke its replies aloud through local RunAnywhere TTS and a desktop playback queue, with barge-in and system-audio muting to keep the microphone and speaker from fighting. That machinery — a `VoiceTurnCoordinator` speaking/barge-in state machine, a streaming PCM playback service, a system-audio mute controller, and a dedicated "Voice" surface — added significant complexity for a talk-back experience we decided not to ship.

## Decision

The Companion replies in **text only**. It never speaks back. There is no local TTS, no playback queue, and no speaking/barge-in/mic-interlock state.

The microphone is **dictation**, not a send button. A push-to-talk turn (button or the global Option shortcut) is captured locally, screened by on-device voice-activity detection, and transcribed on device by RunAnywhere STT. The transcript is placed into the composer for the user to review, edit, and send with a normal `user_message` — the same terminal step a typed message takes. Dictation itself never sends; that decision lives entirely at the call site, which is why the dictation manager holds no runtime client.

Raw audio never crosses the Client boundary. The Mac stays local-vision/local-ears first: it captures and transcribes locally, and the Agent Runtime remains the only Companion brain.

Ambient audio capture is unchanged and retained. When enabled, the Desktop Client periodically captures short local microphone segments, gates them with local VAD, transcribes them on device, stores the transcript only in local Screen Memory, and publishes a compact `perception_event` with `artifact_type: "ambient_audio_summary"`. Secret-like transcript content suppresses the published summary and embedding. This is a separate feature from push-to-talk dictation.

## Consequences

- The talk-back path is removed: the streaming speech playback service, the `SpeechSynthesizer` seam, the `VoiceTurnCoordinator`, the system-audio mute controller, and the `spokenResponsesEnabled` setting are gone. RunAnywhere TTS warm-up (`loadTTSVoice`) is dropped; only STT and VAD warm-up remain.
- The push-to-talk manager is now a transcription-only deep module returning a transcript for the composer; it no longer sends.
- ADR-0004 (push-to-talk turns become `user_message`) still holds for the underlying capture/transcription pipeline; only the terminal step moved from auto-send to fill-the-composer.
- The shared Protocol still owns `ambient_audio_summary`; Runtime ingestion treats it as a normal perception artifact. Screen Memory still owns local audio transcript records alongside screen records.
- The desktop package keeps its explicit `onnxruntime` link-shim dependency for RunAnywhere STT/VAD on macOS.
- Ambient capture state and its toggle live in the menu-bar dropdown; the standalone "Voice" surface is retired.
