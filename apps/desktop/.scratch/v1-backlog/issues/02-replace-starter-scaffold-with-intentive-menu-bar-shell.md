# Replace starter scaffold with Intentive menu bar shell

Status: closed
Labels: enhancement, ready-for-agent
Opened: 2026-05-18T10:32:03Z
Updated: 2026-05-20T10:05:52Z
Closed: 2026-05-20T10:05:52Z

## Description

## Parent

#1

## What to build

Replace the starter Tauri/Vite scaffold with an Intentive menu bar shell. The completed slice should make Intentive behave like a macOS background service with visible Capture Session state and a single contextual toggle, even before ScreenPipe, Ollama, or snapshot delivery are fully implemented.

## States

The shell must handle four distinct states:

| State | Icon | Menu |
|---|---|---|
| Unauthenticated | no dot | clickable "Unauthenticated" item (→ opens sign-in), everything else grayed |
| Stopped | no dot | Toggle ("Start Capturing"), Open Settings, Quit |
| Capturing | red dot | Toggle ("Stop Capturing"), Open Settings, Quit |
| Error | dark yellow dot | non-clickable error info, Open Settings, Quit |

## Menu design

- **One toggle item** whose label changes with state: "Start Capturing" when stopped, "Stop Capturing" when capturing. It is not two separate items.
- In error state: toggle is not shown — only error info text (non-clickable), Open Settings, Quit.
- Unauthenticated state: all items grayed except a clickable "Unauthenticated" item that opens the sign-in surface.
- No Dock icon (LSUIElement = true).

## Auto-start behavior (stubbed)

On launch, the shell checks whether a signed-in user exists. If signed in → auto-start Capture Session immediately (transition to capturing state). If not signed in → unauthenticated state. The auth provider is not wired in this issue — use a stub that can be swapped later.

## Acceptance criteria

- [ ] Intentive appears as a menu bar app and does not show a Dock icon.
- [ ] The menu shows a single contextual toggle: "Start Capturing" when stopped, "Stop Capturing" when capturing.
- [ ] The menu bar icon shows no dot (stopped/unauthenticated), red dot (capturing), dark yellow dot (error).
- [ ] Unauthenticated state: all items grayed except a clickable "Unauthenticated" item that opens the sign-in surface.
- [ ] Error state: no toggle shown — only non-clickable error info, Open Settings, and Quit.
- [ ] On launch with a stubbed signed-in user, the shell auto-transitions to capturing state.
- [ ] On launch with no signed-in user, the shell shows unauthenticated state.
- [ ] Quitting Intentive from any state exits cleanly.
- [ ] The starter React welcome screen and starter greet command no longer define product behavior.
- [ ] Tests or a documented smoke check verify all four state transitions.

## Blocked by

None — can start immediately

## Out of scope for this issue

- Fixed 10-minute Context Heartbeat cadence (heartbeat issue)
- Session End Marker (heartbeat issue)
- Consent step in sign-in flow (auth issue)
- Actual auth provider integration

## Comments

(No comments.)
