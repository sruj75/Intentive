# Fixed-interval Context Heartbeat with Session End Marker

The Context Heartbeat fires every 10 minutes during a Capture Session regardless of activity level, and sends a Session End Marker when the session ends for any reason.

## Context

The original design was activity-gated: the heartbeat would skip a tick if no meaningful activity (new OCR text, audio transcription, or window switch) had occurred since the last snapshot. This created an ambiguity the Agent Runtime cannot resolve: silence from Intentive could mean "nothing changed" or "the user quit." Both look identical from the runtime's perspective.

## Decision

Replace activity-gating with a fixed 10-minute interval. Always fire. On each tick the LLM Provider receives the last 10 minutes of ScreenPipe data and produces a Context Snapshot — even if state is largely unchanged, the summary is naturally brief ("user continued watching the same video"). When a Capture Session ends for any reason (user toggle, quit, ScreenPipe crash), the Context Heartbeat sends one final Session End Marker before shutting down.

The Session End Marker is a signal sent when the Capture Session ends for any reason. The Agent Runtime uses it to distinguish "still active, no snapshot yet" from "session is over." The exact payload shape and whether the runtime handles it differently from a regular Context Snapshot is deferred until the runtime-side contract is defined.

## Considered Options

- **Activity-gated skipping**: Skip ticks with no meaningful change. Rejected because the Agent Runtime cannot distinguish idle-but-active from quit.
- **Periodic + activity-gated hybrid**: Always send at 30-minute mark even if nothing changed, skip shorter ticks. Rejected as additional complexity with no clear benefit over a fixed interval.

## Consequences

- The runtime-sink payload shape for the Session End Marker is deferred — to be defined when the Agent Runtime contract is known.
- Context Heartbeat tests no longer need to cover activity-gated skip logic.
