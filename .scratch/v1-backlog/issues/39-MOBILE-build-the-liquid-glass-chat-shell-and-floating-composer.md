# Build the Liquid Glass Chat Shell and Floating Composer

Status: open
Labels: ready-for-agent
Deployable: mobile
Opened: 2026-05-22T12:15:19Z
Updated: 2026-05-23T07:19:36Z

## Description

## Parent

.scratch/v1-backlog/prds/mobile-PRD.md

## What to build

Create the no-header/no-tabs full-screen **Companion Chat** surface with Intentive message visuals and a bottom floating **Liquid Glass Composer**. This slice owns the presentation of the runtime-generated onboarding opening: the chat opens normally, renders a real assistant composing bubble while that first message is in flight, allows the user to draft, and holds send until the opening is delivered intact.

If that protected onboarding opening fails, replace the composing bubble inline with quiet recovery copy and one `Try again` action. Preserve the user's draft and held-send state while retry is in progress. Day-to-day simultaneous-send behavior outside this onboarding opening remains TBD.

## Acceptance criteria

- [ ] Main App opens to a full-screen Liquid Glass Chat Shell with no conventional header and no bottom tabs.
- [ ] User and assistant messages use Intentive-owned visuals rather than vendor example styling.
- [ ] Liquid Glass Composer is bottom anchored, floating, touch-friendly, and visually integrated with the chat surface.
- [ ] Composer remains usable with keyboard open and respects bottom safe area.
- [ ] Message list scroll insets keep latest content visible above the Composer.
- [ ] A runtime-reported protected onboarding opening renders as an assistant composing bubble in the ordinary Companion Chat shell, not a separate onboarding surface.
- [ ] During the protected opening, the user may edit a draft but cannot send until the real opening message is delivered.
- [ ] Opening failure replaces the composing bubble with quiet inline recovery and one `Try again` action while preserving the draft and held-send state.
- [ ] The shell does not define day-to-day concurrent-send/interruption behavior from the onboarding-only rule.
- [ ] Dynamic Type, light/dark appearance, and safe-area behavior are checked.
- [ ] Tests or visual checks cover keyboard/composer overlap, message-list inset behavior, protected opening draft/send behavior, and opening recovery presentation.

## Blocked by

- #27
- #38


## Comments

(No comments.)
