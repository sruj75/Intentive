# ADR 0007: Bidirectional voice v2 uses RunAnywhere for local ears and mouth

## Status

Accepted.

## Decision

Desktop voice v2 uses the RunAnywhere Swift SDK for local STT, VAD, and TTS. The Mac remains an ears-and-mouth Client: it captures and synthesizes audio locally, while the Agent Runtime remains the only Companion brain.

Raw audio never crosses the Client boundary. Push-to-talk turns are VAD-gated, transcribed on device, and sent as normal `user_message` events. Companion replies can be spoken locally through RunAnywhere TTS and a desktop playback queue. Barge-in stops current playback before new microphone capture starts.

Ambient audio capture is off by default. When enabled, the Desktop Client periodically captures short local microphone segments, gates them with local VAD, transcribes them on device, stores the transcript only in local Screen Memory, and publishes a compact `perception_event` with `artifact_type: "ambient_audio_summary"`. Secret-like transcript content suppresses the published summary and embedding.

## Consequences

- The shared Protocol owns `ambient_audio_summary`; Runtime ingestion treats it as a normal perception artifact.
- Screen Memory owns local audio transcript records alongside screen records.
- The menu-bar item shows ambient capture state and can disable ambient capture in one click.
- The current RunAnywhere `0.19.13` Swift package publishes iOS-named ONNX artifacts for macOS and does not link ONNX Runtime symbols by itself. The desktop package therefore keeps an explicit `onnxruntime` dependency as a link shim while FluidAudio remains removed.
