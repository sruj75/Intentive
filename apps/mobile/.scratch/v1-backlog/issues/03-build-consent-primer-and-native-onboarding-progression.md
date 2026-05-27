# Build Consent Primer and Native Onboarding Progression

Status: open
Labels: ready-for-agent
Opened: 2026-05-22T12:13:59Z
Updated: 2026-05-23T07:19:38Z

## Description

## Parent

#1

## What to build

Add the tiny native **Consent Primer** before any relationship-forming companion conversation. Consent is relationship-level progress owned through the Control Plane-facing setup contract: when a user has already completed it in a sibling Client App, the Mobile Surface must not ask again. Keep notification permission deferred until a Held Intention or Follow-Up creates a contextual reason on that device.

## Acceptance criteria

- [ ] Signed-in users whose relationship has not yet consented see a separate native Consent Primer before Companion Chat.
- [ ] Consent Primer explains memory, follow-ups, and user control in concise trust-setting language.
- [ ] Completing consent advances through the Entry Resolver to macOS Setup or the next selected destination.
- [ ] Consent completion is represented through the Control Plane-facing setup contract, with a local/dev implementation acceptable for this slice.
- [ ] Consent already completed through the macOS Client suppresses repeated relationship consent on the Mobile Surface.
- [ ] Notification permission is not requested during launch, auth, or consent and is not treated as shared relationship consent.
- [ ] Tests cover consent pending, local completion, sibling-client completion, and no early notification prompt.

## Blocked by

- #2
- #3


## Comments

(No comments.)
