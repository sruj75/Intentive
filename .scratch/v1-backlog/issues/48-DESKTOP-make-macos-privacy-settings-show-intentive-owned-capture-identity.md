# Make macOS Privacy Settings show Intentive-owned capture identity

Status: open
Labels: enhancement, ready-for-agent
Deployable: desktop
Opened: 2026-05-21T12:33:32Z
Updated: 2026-05-21T12:33:32Z

## Description

## Parent

.scratch/v1-backlog/prds/desktop-PRD.md

## What to build

Make the final packaged Capture Session permission identity product-owned. macOS Privacy Settings should present `Intentive` as the capture permission owner, with `Intentive Capture` as the only acceptable fallback helper identity if macOS cannot attribute capture access to the main app bundle. ScreenPipe remains the technical capture component, but it must not become the user-facing permission trust surface.

## Acceptance criteria

- [ ] The signed `/Applications/Intentive.app` build is tested first with the raw bundled ScreenPipe resource path.
- [ ] If raw bundled ScreenPipe is attributed to `Intentive` in macOS Privacy Settings, that result is documented as the accepted path.
- [ ] If raw bundled ScreenPipe appears as ScreenPipe, lowercase `intentive`, a raw helper name, or a debug/path-like identity, implement an Intentive-owned signed helper/sidecar fallback.
- [ ] The fallback identity is named `Intentive Capture`.
- [ ] The fallback preserves ADR-0002 child-process/HTTP integration unless final smoke proves that impossible.
- [ ] If neither `Intentive` nor `Intentive Capture` can be achieved with the child-process model, create a follow-up decision to revisit embedding `screenpipe-engine`; do not silently change ADR-0002.
- [ ] macOS Privacy Settings never shows ScreenPipe, lowercase `intentive`, raw helper names, or debug paths as acceptable release identity.
- [ ] Tests or documented release smoke prove Screen & System Audio Recording, Microphone, and Accessibility rows meet the identity rule.

## Blocked by

- #47

## Comments

(No comments.)
