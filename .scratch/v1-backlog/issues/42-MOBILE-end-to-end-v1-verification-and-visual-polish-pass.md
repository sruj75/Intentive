# End-to-End V1 Verification and Visual Polish Pass

Status: open
Labels: ready-for-agent
Deployable: mobile
Opened: 2026-05-22T12:16:15Z
Updated: 2026-05-22T12:16:15Z

## Description

## Parent

.scratch/v1-backlog/prds/mobile-PRD.md

## What to build

Verify the complete V1 client path from launch through auth, consent, sibling-client setup, relationship onboarding, chat, reconnect hydration, account recovery, keyboard behavior, and Liquid Glass polish. This slice is intentionally HITL because Account Affordance placement, composer feel, and Liquid Glass visual quality need human design judgment.

## Acceptance criteria

- [ ] Full launch-to-main-app flow is verified on iOS.
- [ ] Auth, Consent Primer, Sibling Client Invitation, Relationship Onboarding, Main App, and Account Surface all connect through the launch resolver.
- [ ] Companion Chat can send, receive, retry, hydrate **Conversation History** from reconnect snapshot, and render live updates without a local message database.
- [ ] Keyboard, safe-area, Dynamic Type, light/dark mode, and scroll-inset behavior are checked.
- [ ] Account Affordance placement is reviewed and finalized or explicitly deferred with rationale.
- [ ] Liquid Glass Composer and Account Surface pass a human visual polish review.
- [ ] The issue records any follow-up bugs or deferred improvements instead of silently widening V1 scope.

## Blocked by

- #13
- #14
- #15
- #16
- #27
- #38
- #39
- #40
- #41

## Comments

(No comments.)
