# Scaffold the Expo Client App and Launch State Resolver

Status: open
Labels: ready-for-agent
Deployable: mobile
Opened: 2026-05-22T12:13:16Z
Updated: 2026-05-23T07:19:36Z

## Description

## Parent

.scratch/v1-backlog/prds/mobile-PRD.md

## What to build

Create the initial Intentive Expo client skeleton and an evolvable **Entry Resolver** for the current V1 **Pre-Chat Gates**. The **Mobile Client** renders the selected gate or enters the single **Companion Chat** destination.

Issue #13 defines a typed Entry Resolver contract shaped around a future **Control Plane** response, using injectable demo fixtures for this initial slice. Fixtures simulate server-owned entry decisions only; they must not become authoritative local onboarding state or authored companion conversation content.

The current V1 Mobile Client gates are:

- **Identity Gate** for signed-out users.
- **Consent Primer** only until relationship-level consent has been completed on any Client App.
- **macOS Setup** as a guided but skippable **Sibling Client Invitation** when mobile Companion Chat can still work meaningfully.

**Relationship Onboarding** is not a route or client-visible chat mode. Once the Entry Resolver selects Companion Chat, later runtime/chat slices own actual assistant message delivery and first-opening behavior.

The set and order of Pre-Chat Gates may evolve without creating another chat destination.

## Acceptance criteria

- [ ] App has a native route/state structure for Launch, the current V1 Pre-Chat Gates, the single Companion Chat destination, and Account Surface entry.
- [ ] A typed Entry Resolver contract represents a Control Plane-selected Pre-Chat Gate or entry into Companion Chat.
- [ ] Injectable fixture-backed Entry Resolver scenarios support demo and test work without live Control Plane networking.
- [ ] Relationship Onboarding is not represented as a separate launch route, client-visible chat mode, or fixture-authored assistant opening message.
- [ ] Fixture scenarios represent relationship consent already completed through a sibling Client App without asking again on the **Mobile Client**.
- [ ] Fixture scenarios represent macOS Setup pending, skipped, connected, and blocking-if-required states.
- [ ] Skipping eligible macOS Setup removes it as a blocking Pre-Chat Gate on ordinary relaunch.
- [ ] Fixture scenarios represent a user whose shared progress already leads directly to the correct remaining gate or Companion Chat destination.
- [ ] Device-specific permissions, including iPhone notifications, are not modeled as shared relationship consent.
- [ ] Placeholder screens and state names use Intentive domain terms from `CONTEXT.md`.
- [ ] Entry Resolver tests cover each current V1 gate outcome, skip persistence, cross-client/shared-progress outcomes, and Companion Chat entry.
- [ ] Resolver modeling permits future gates to be added, removed, or reordered without introducing a separate Companion Chat surface.

## Out of scope

- Live network-backed Control Plane integration.
- Gate-screen feature implementation beyond scaffold placeholders; owned by #13, #14, and #15.
- Actual **Agent Runtime** conversation delivery and first-message initiation; owned by #27.
- **Conversation History** hydration from reconnect snapshot; owned by #38.
- **Companion Chat** composing, draft, and opening-recovery interaction behavior; owned by #39.
- **Account Surface** setup recovery implementation; owned by #40.
- Contextual in-chat macOS invitation behavior; owned by #41.
- Client-owned local persistence of authoritative cross-client onboarding progress.

## Blocked by

None - can start immediately


## Comments

(No comments.)
