# Build Consent Primer and Native Onboarding Progression

Status: open
Labels: ready-for-agent
Deployable: mobile
Opened: 2026-05-22T12:13:59Z
Updated: 2026-05-23T07:19:38Z

## Description

## Parent

.scratch/v1-backlog/prds/mobile-PRD.md

## What to build

Add the tiny native **Consent Primer** before any relationship-forming companion conversation. Consent is relationship-level progress owned through the **Control Plane** gate contract: when a user has already completed it in a sibling Client App, the **Mobile Client** must not ask again. Keep notification permission deferred until first chat entry or a **Post-Message-Back**-driven reason on that device.

## Acceptance criteria

- [ ] Signed-in users whose relationship has not yet consented see a separate native Consent Primer before Companion Chat.
- [ ] Consent Primer explains memory, follow-ups, and user control in concise trust-setting language.
- [ ] Completing consent advances through the Entry Resolver to macOS Setup or the next selected destination.
- [ ] Consent completion is represented through the **Control Plane** gate contract, with a local/dev implementation acceptable for this slice.
- [ ] Consent already completed through the Desktop Client suppresses repeated relationship consent on the **Mobile Client**.
- [ ] Notification permission is not requested during launch, auth, or consent and is not treated as shared relationship consent.
- [ ] Tests cover consent pending, local completion, sibling-client completion, and no early notification prompt.

## Blocked by

- #13


## Comments

(No comments.)
