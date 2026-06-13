# Emit the Session End Marker before ScreenPipe shutdown

On a capture **Stop**, the Capture Session coordinator stops the Context Heartbeat — which drains a final Context Snapshot and emits the **Session End Marker** — _before_ it stops the ScreenPipe Supervisor.

## Context

ADR-0008 established that the Context Heartbeat sends one Session End Marker when a Capture Session ends for any reason, and #34 wired that marker onto the live Protocol `WsSession` (`session_end_marker` event) through `WsSessionAgentSink`.

The coordinator's `Effect::StopSession` originally ran `supervisor.stop().await` **then** `heartbeat.stop(reason).await`. That left the marker leaving the process _after_ ScreenPipe had already exited. The signed-in Capture Session smoke (#35) makes the end-to-end ordering an explicit Acceptance Criterion: _Stop emits a `session_end_marker` before ScreenPipe shutdown._ Two facts make the original order unnecessary:

- `ContextHeartbeat::stop` needs neither a live ScreenPipe (the final snapshot's window is queried at tick time, and a stop with zero ticks still emits the marker) nor a fresh capture.
- The marker rides the independent `WsSession`, which is torn down only by the sign-out path (`clear_login_token`) — never by capture teardown. So the socket is still open when the heartbeat stops, exactly as for snapshots (best-effort, at-most-once; ADR-0005).

## Decision

Reverse the two steps inside `Effect::StopSession` only:

```
self.stop_heartbeat(reason).await;   // drains final snapshot, emits Session End Marker
let _ = self.supervisor.stop().await; // then kill ScreenPipe
```

`Effect::StartSession` keeps its order (supervisor first, then heartbeat). `Effect::EndSession` is untouched — it handles a supervisor that already reported `Stopped`/`Crashed`, so ScreenPipe is already gone and only the heartbeat needs ending.

This is a behavioral amendment to the #34 ordering note, not a contract change: the wire events and their payloads are unchanged.

## Considered Options

- **Keep supervisor-first, assert nothing.** Rejected: the AC wants the marker provably out before ScreenPipe dies, and a crash mid-shutdown could drop the marker.
- **Tear down Routing as part of capture Stop so the marker is the last frame.** Rejected: Routing lifetime is deliberately independent of capture (sign-out owns it); coupling them would break reconnect semantics for no gain.

## Consequences

- A coordinator unit test (`stop_session_emits_marker_before_stopping_supervisor`) pins the order via a shared event log shared by the fake supervisor and recording hooks.
- The #35 smoke asserts the gateway records the marker's `received_at` at or before the supervisor's `screenpipe_exited` timestamp in the structured smoke log.
- `EndSession` (already-dead supervisor) is unaffected; only operator/readiness-driven Stop changes.
