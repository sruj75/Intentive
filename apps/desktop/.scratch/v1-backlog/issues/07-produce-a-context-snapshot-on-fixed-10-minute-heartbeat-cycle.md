# Produce a Context Snapshot on fixed 10-minute heartbeat cycle

Status: closed
Labels: enhancement, ready-for-agent
Opened: 2026-05-18T10:33:36Z
Updated: 2026-05-27T12:00:00Z
Closed: 2026-05-27T12:00:00Z

## Description

## Parent

#1

## What to build

Implement the Context Heartbeat as a fixed 10-minute service that produces a local Context Snapshot on every tick during a Capture Session. A completed slice queries ScreenPipe for the preceding 10-minute activity window, summarizes it on-device through Ollama with privacy constraints, writes the resulting Context Snapshot to the local store, and sends a Session End Marker when the Capture Session ends for any reason.

## Acceptance criteria

- [ ] The Context Heartbeat runs only during an active Capture Session.
- [ ] The heartbeat fires on a fixed 10-minute cadence regardless of activity level — there is no skip or idle detection.
- [ ] Each tick queries ScreenPipe's HTTP API for the preceding 10-minute activity window.
- [ ] Raw ScreenPipe data is passed only to the local summarization boundary and is not stored as a Context Snapshot.
- [ ] The summarization prompt instructs the model not to include passwords, credentials, financial data, or personal identifiers.
- [ ] A valid Context Snapshot is written locally before any push behavior is introduced.
- [x] When the Capture Session ends for any reason (toggle, quit, ScreenPipe crash), a Session End Marker is sent before shutdown. Delivery call site exists; Protocol payload wiring completes in #8.
- [ ] Tests cover 10-minute cadence firing, activity-window construction, prompt constraints, write-before-push ordering, and Session End Marker emission on session stop/quit/crash.

## Blocked by

- #5
- #6

## Comments

### 01 @alignment — 2026-05-27T12:00:00Z

Closed — implemented in `context_heartbeat/` (`HEARTBEAT_INTERVAL` = 600s), write-before-delivery via `SnapshotStore` + `AgentSink`, session-end call site in capture coordinator. Remaining gap: HTTPS stub sink → Protocol WebSocket (#8, #11); not part of this slice.
