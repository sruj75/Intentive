# Build Capture Permission Setup for required macOS grants

Status: open
Labels: enhancement, ready-for-agent
Opened: 2026-05-21T12:33:53Z
Updated: 2026-05-21T12:33:53Z

## Description

## Parent

#1

## What to build

Build Capture Permission Setup as the first-run product flow that makes Auth capture-ready. The flow should guide users through macOS Privacy Settings one required permission at a time with curated instructional screenshots, open the relevant Apple panel when possible, and wait for live OS grant detection before a Capture Session can auto-start.

## Acceptance criteria

- [ ] Capture Permission Setup presents Screen & System Audio Recording, Microphone, and Accessibility as required v1 grants.
- [ ] Each step uses static bundled instructional screenshots in the style of Opal rather than live screenshots of the user's macOS Privacy Settings.
- [ ] Each step opens or deep-links to the relevant macOS Privacy Settings pane when possible.
- [ ] If a deep link fails, the flow falls back to opening Privacy & Security and keeps the instructional screenshot visible.
- [ ] Each step waits for live OS permission detection before advancing.
- [ ] Each step includes a Recheck action for users who already granted the permission.
- [ ] Capture Permission Setup is incomplete until all three required grants are present.
- [ ] Intentive does not start ScreenPipe or a Context Heartbeat while Capture Permission Setup is incomplete.
- [ ] User-facing copy says Intentive and does not expose ScreenPipe diagnostics, endpoint URLs, API keys, or developer configuration.
- [ ] The flow works from first launch and from a later `Finish Setup…` path if the user exits before completion.
- [ ] Tests or documented smoke cover missing permission, grant detection, recheck, and all-grants-complete behavior.

## Blocked by

None - can start immediately; final release identity verification is completed by #14.

## Comments

(No comments.)
