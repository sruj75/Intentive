# Wire full signed-in Capture Session happy path smoke

Status: open
Labels: enhancement, ready-for-agent
Opened: 2026-05-18T10:34:14Z
Updated: 2026-05-21T12:34:56Z

## Description

## Parent

#1

## What to build

Wire a demoable full signed-in Capture Session happy path across Intentive's v1 infrastructure. A completed slice proves that launching Intentive as a signed-in/configured user auto-starts capture, the Context Heartbeat produces a Context Snapshot every 10 minutes, the snapshot is written locally, and the snapshot is pushed through Auth-resolved Agent Interface configuration to a controlled endpoint.

## Acceptance criteria

- [ ] A documented smoke path launches Intentive with a stubbed or real signed-in configured user and confirms capture auto-starts.
- [ ] The smoke path proves the Agent Interface configuration came from Auth-resolved state rather than manual Settings fields.
- [ ] The smoke path observes or simulates ScreenPipe activity over a 10-minute window.
- [ ] The smoke path produces a sanitized Context Snapshot through the Context Heartbeat.
- [ ] The Context Snapshot is written to the local snapshot store before delivery.
- [ ] The Context Snapshot is pushed to a controlled test endpoint through the Agent Interface.
- [ ] Stopping capture triggers a Session End Marker before ScreenPipe is shut down.
- [ ] The menu bar reflects unauthenticated, capturing, stopped, and error states as applicable.
- [ ] Settings can open/close during the smoke path and may mirror user-facing Intentive account/capture state without exposing ScreenPipe diagnostics or manual endpoint/API key fields.
- [ ] The smoke path is documented clearly enough for an AFK agent or reviewer to repeat.

## Blocked by

- #2
- #3
- #4
- #5
- #6
- #7
- #8
- #9
- #13

## Comments

### 01 @sruj75 — 2026-05-21T12:32:19Z

Packaging/permission smoke addendum from the May 21 product-packaging pass:

This runtime happy-path smoke should meet the final packaged-app smoke at the end of v1. Keep the existing signed-in Capture Session path, and add references to the release smoke issue once created. The runtime smoke is not complete launch evidence unless the final notarized `/Applications/Intentive.app` flow also proves:

- macOS Privacy Settings shows `Intentive` or fallback `Intentive Capture`, never ScreenPipe, lowercase `intentive`, raw helper names, or debug paths.
- Capture does not start until Capture Permission Setup has verified Screen & System Audio Recording, Microphone, and Accessibility.
- ScreenPipe starts on `127.0.0.1:44380`, health is healthy, frame writes occur, and both microphone/system-audio chunks are written.
- Stop Capturing removes the ScreenPipe listener/process and returns the tray to stopped.
- Quit leaves no Intentive-owned ScreenPipe process behind.

The existing issue should stay focused on the runtime happy path; the packaged release smoke belongs in a dedicated launch issue and should be a blocker for calling #10 launch-complete.

### 02 @sruj75 — 2026-05-21T12:34:56Z

Follow-up links from the packaging issue pass:

- Final packaged-app release smoke now lives in #20 and blocks calling the runtime happy path launch-complete.
- Release packaging lives in #17.
- Product-owned macOS Privacy Settings identity lives in #18.
- Capture Permission Setup lives in #19.

Keep #10 focused on runtime signed-in Capture Session behavior; #20 is the final installed-app release bar.
