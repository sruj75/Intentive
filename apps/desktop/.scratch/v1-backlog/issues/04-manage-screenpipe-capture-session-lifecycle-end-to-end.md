# Manage ScreenPipe Capture Session lifecycle end to end

Status: closed
Labels: enhancement, ready-for-agent
Opened: 2026-05-18T10:32:41Z
Updated: 2026-05-21T07:55:40Z
Closed: 2026-05-21T07:55:40Z

## Description

## Parent

#1

## What to build

Manage ScreenPipe as the internal Capture Session subprocess boundary. A completed slice lets Intentive start and stop ScreenPipe from product controls, reflect live user-facing capture state through Intentive app state, and enter an error state if ScreenPipe crashes or exits unexpectedly.

ScreenPipe remains an implementation boundary. User-facing surfaces should say whether Intentive is capturing, stopped, unauthenticated, or in an error state. They should not expose ScreenPipe diagnostics as Settings content.

## Acceptance criteria

- [ ] Intentive can start ScreenPipe when a Capture Session starts.
- [ ] Intentive can stop the ScreenPipe process it owns when the user stops capture or quits Intentive.
- [ ] Duplicate Start actions do not create duplicate ScreenPipe processes.
- [ ] Unexpected ScreenPipe exit moves Intentive into an error state surfaced through app state.
- [ ] Capture Session state is available to the menu bar shell and can be mirrored by Settings as user-facing Intentive state if needed.
- [ ] Settings does not expose ScreenPipe readiness or diagnostics as a separate user-facing panel.
- [ ] The implementation treats ScreenPipe's local HTTP/WebSocket APIs as the integration boundary.
- [ ] Tests or a documented smoke check cover start, stop, duplicate start prevention, and crash/error transition behavior.

## Blocked by

- #3

## Comments

### 01 @sruj75 — 2026-05-21T07:55:39Z

Closed via #16 — `capture_session` ScreenPipe subprocess lifecycle (start/stop, port probe, duplicate-start guard, crash → Capture Error), bundled binary, and tests are on `feature/issue-2to5`.
