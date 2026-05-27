# Build macOS Setup as a Guided, Skippable Sibling Client Invitation

Status: open
Labels: ready-for-agent
Opened: 2026-05-22T12:14:14Z
Updated: 2026-05-23T07:19:52Z

## Description

## Parent

#1

## What to build

Build **macOS Setup** as a guided but skippable **Sibling Client Invitation** after the Consent Primer. It should explain that adding the macOS Client gives Intentive fuller context on how the user works so the companion can nudge them better, while allowing users to continue into **Companion Chat** on iPhone whenever mobile chat is meaningful without desktop context.

This is a Pre-Chat Gate, not Relationship Onboarding. Skipping means `not now`: it removes this gate from ordinary relaunch, while setup status remains available for later Account Surface recovery.

## Acceptance criteria

- [ ] Users reach macOS Setup when selected by the Entry Resolver after consent.
- [ ] macOS Setup presents a native Sibling Client Invitation with capability-honest context about what connecting Mac improves.
- [ ] Capability state can mark Mac setup as optional/skippable or required because meaningful mobile Companion Chat is unavailable without it.
- [ ] Eligible users can skip setup and continue into Companion Chat without a separate Relationship Onboarding route.
- [ ] A required setup state prevents entry into Companion Chat with clear capability-honest explanation.
- [ ] Skipping eligible setup persists through the setup-state boundary so it does not recur as an ordinary launch gate.
- [ ] Setup status is exposed for later Account Surface recovery in #10.
- [ ] Tests cover skipped, connected, optional-pending, required/blocking, and relaunch-after-skip states.

## Out of scope

- Contextual in-chat re-invitation when missing Mac context becomes relevant; owned by #11.

## Blocked by

- #4


## Comments

(No comments.)
