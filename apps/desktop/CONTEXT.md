# Desktop Client

The Desktop Client is the macOS half of Intentive. It captures local context, compiles it locally, joins the one Companion conversation, and runs desktop-local effects chosen by the Agent Runtime.

## Language

**Desktop Capture Layer**:
The macOS capture substrate: permissions, screen/window/audio capture, power awareness, excluded-app rules, and local capture backpressure.
_Avoid_: raw upload path, cloud capture, capture-only app

**Screen Memory**:
The local timeline and search surface for screen records created on the Mac. It stores local OCR, metadata, local embeddings, retention policy, and user-facing search.
_Avoid_: Rewind

**Desktop Context Compiler**:
The local compiler that turns captured frames and OCR into compact, redacted Protocol `perception_event` records. It is deterministic in v1; local vision models are an upgrade path.
_Avoid_: saliency gate, cloud summarizer, proactive assistant

**Runtime Bridge**:
The Desktop Client's WebSocket adapter for the shared Protocol. It connects with `client_kind: "desktop"`, sends `user_message`, `perception_event`, `presence_update`, `delivery_ack`, and `session_end_marker`, and receives the same `companion_message` stream as Mobile.
_Avoid_: desktop channel, Mac-only protocol

**Effect Runner**:
The local presenter for Agent Runtime decisions that target the Mac. Post-Message-Back can reveal the Floating Bar and approved overlays; ordinary replies update the existing conversation without interrupting.
_Avoid_: action robot, local agent, click executor

**Floating Bar**:
The compact, text-only desktop chat surface that joins the one Companion conversation. It is the only Desktop conversation surface and never exposes dictation, tool calls, or subagent controls.
_Avoid_: chat lab, agent pill, delegation bar

## Boundaries

- Raw frames, recordings, thumbnails, and audio do not leave the Mac in v1.
- The Desktop Client may synchronize compact text and metadata records only; media sync requires a future explicit decision.
- Provider API keys never live on the Mac.
- The Desktop Context Compiler emits evidence and candidate artifacts; the Agent Runtime decides whether to act.
- Screen Memory is local truth for screen records. Conversation History is Runtime truth.
- Passive microphone and meeting-gated system-audio sensing is local, on by default, and separate from conversation input. It emits only filtered local transcript summaries.
- Post-Message-Back is the only proactive presentation trigger. Intentive does not duplicate a floating nudge with a product macOS notification.
