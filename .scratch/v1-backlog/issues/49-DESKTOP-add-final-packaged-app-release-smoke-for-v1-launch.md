# Add final packaged-app release smoke for v1 launch

Status: open
Labels: enhancement, ready-for-human
Deployable: desktop
Opened: 2026-05-21T12:34:28Z
Updated: 2026-05-21T12:34:28Z

## Description

## Parent

.scratch/v1-backlog/prds/desktop-PRD.md

## What to build

Add the final v1 launch smoke checklist for the packaged product, run against the signed and notarized DMG installed as `/Applications/Intentive.app`. This is the release bar that joins runtime Capture Session verification with product-owned macOS identity and permission onboarding.

## Acceptance criteria

- [ ] Install the notarized DMG into `/Applications/Intentive.app` before running smoke.
- [ ] Launch `Intentive.app` and verify no Dock icon appears.
- [ ] Verify the Intentive status item appears in the menu bar.
- [ ] Verify app identity surfaces show `Intentive` where applicable, including Login Items when launch-at-login is enabled.
- [ ] Verify macOS Privacy Settings shows `Intentive` for required capture grants, or fallback `Intentive Capture` only where macOS requires a helper row.
- [ ] Verify macOS Privacy Settings does not show ScreenPipe, lowercase `intentive`, raw helper names, raw paths, or `target/debug/intentive` as release identity.
- [ ] Run Capture Permission Setup and verify it walks Screen & System Audio Recording, Microphone, and Accessibility with static screenshots and live checks.
- [ ] Verify Capture Session does not start until all required grants are present.
- [ ] Once capture-ready, verify ScreenPipe starts on `127.0.0.1:44380`.
- [ ] Verify ScreenPipe health returns healthy with `frame_status=ok` and `audio_status=ok`.
- [ ] Verify frame rows or frame artifacts are written during capture.
- [ ] Verify microphone audio chunks are written during capture.
- [ ] Verify system-audio chunks are written during capture.
- [ ] Verify Stop Capturing removes the ScreenPipe listener/process and returns the tray to stopped.
- [ ] Verify Quit leaves no Intentive-owned ScreenPipe process behind.
- [ ] Verify relaunch from `/Applications/Intentive.app` preserves product identity and does not show debug paths.
- [ ] Document exact commands, screenshots, or observations needed for a reviewer to repeat the smoke.

## Blocked by

- #37
- #47
- #48
- #26

## Comments

(No comments.)
