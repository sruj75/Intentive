# End-to-End V1 Verification and Visual Polish Pass

Status: open
Labels: ready-for-agent
Opened: 2026-05-22T12:16:15Z
Updated: 2026-05-22T12:16:15Z

## Description

## Parent

#1

## What to build

Verify the complete V1 client path from launch through auth, consent, macOS setup, relationship onboarding, chat, persistence, account recovery, keyboard behavior, and Liquid Glass polish. This slice is intentionally HITL because Account Affordance placement, composer feel, and Liquid Glass visual quality need human design judgment.

## Acceptance criteria

- [ ] Full launch-to-main-app flow is verified on iOS.
- [ ] Auth, Consent Primer, macOS Setup, Relationship Onboarding, Main App, and Account Surface all connect through the launch resolver.
- [ ] Companion Chat can send, receive, retry, persist, and reload messages.
- [ ] Keyboard, safe-area, Dynamic Type, light/dark mode, and scroll-inset behavior are checked.
- [ ] Account Affordance placement is reviewed and finalized or explicitly deferred with rationale.
- [ ] Liquid Glass Composer and Account Surface pass a human visual polish review.
- [ ] The issue records any follow-up bugs or deferred improvements instead of silently widening V1 scope.

## Blocked by

- #2
- #3
- #4
- #5
- #6
- #7
- #8
- #9
- #10
- #11

## Comments

(No comments.)
