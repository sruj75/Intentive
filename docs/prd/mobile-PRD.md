# Intentive Mobile Client V1 PRD

> **Canonical vocabulary:** the Mobile Client [`CONTEXT.md`](../../apps/mobile/CONTEXT.md) and the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md). This PRD is the parent scope for related GitHub issues; when they disagree, CONTEXT wins.

## Problem Statement

Users need a **Mobile Client** that lets them authenticate, complete **Pre-Chat Gates**, and enter a calm chat-first experience with the **Companion**. Without it, Intentive has no iOS-native relationship surface for **Companion Chat**, no lightweight account/setup recovery, and no path to validate the Liquid Glass shell before full **Agent Runtime** integration.

The app must move quickly without becoming a generic chat clone, productivity dashboard, or task manager. It should feel native, quiet, continuous, and capability-honest. The **Agent Runtime**, **Control Plane** gate state, **Protocol** wire format, and proactive autonomy live outside the client.

## Solution

Build **Mobile Client** V1 as an iOS-first Expo app with native **Pre-Chat Gate** screens and a chat-first main experience.

The client sequence is:

1. Launch resolves auth and **Pre-Chat Gate** state via **Control Plane** `GET /me`.
2. Signed-out users see **Identity Gate** (Google OAuth; Apple later).
3. Signed-in users see **Consent Primer** before the first companion conversation.
4. Users complete **Sibling Client Invitation** (macOS setup guidance; skippable).
5. Relationship onboarding begins inside **Companion Chat** (runtime-generated opening — not a separate wizard route).
6. **Main App** is a full-screen Liquid Glass Chat Shell with no header and no bottom tabs.
7. **Account Surface** opens from a visible but quiet account affordance.

MVP 1 spikes `assistant-ui/native` as a replaceable Chat Primitive Engine behind Intentive Chat Components. The app owns the Liquid Glass shell, message visuals, Liquid Glass Composer, **Protocol** WebSocket client boundary, native gate screens, and **Account Surface**. **Conversation History** is server-truth on the **Agent Runtime** — hydrated from the Protocol reconnect snapshot, not persisted locally.

## User Stories

1. As a new mobile user, I want to open Intentive and understand I am entering a companion relationship, so the first experience feels trustworthy rather than generic.
2. As a signed-out user, I want a minimal Google sign-in step, so continuity exists from my first real conversation.
3. As a signed-out user, I want auth copy to explain continuity, so sign-in feels purposeful rather than account friction.
4. As a returning user, I want the app to resolve my session on launch, so I return to the right gate or **Companion Chat**.
5. As a returning user with incomplete gates, I want the app to resume the next step, so I am not stranded or reset.
6. As a first-time signed-in user, I want a short **Consent Primer** before chat starts, so memory and follow-ups feel user-approved.
7. As a first-time signed-in user, I want the Consent Primer as a native screen, so the experience feels polished.
8. As a privacy-sensitive user, I want plain-language consent copy, so I understand what I am agreeing to.
9. As a user, I want notification permission deferred until first chat entry (or a **Post-Message-Back**-driven reason), so launch does not feel like a permission grab.
10. As a user, I want guidance to install the **Desktop Client**, so the ecosystem is ready when Mac context matters.
11. As a user who can chat without the Mac, I want macOS setup skippable, so I am not blocked unnecessarily.
12. As a user who needs Mac context for the current experience, I want contextual prompts (not a repeated blocking gate), so the app stays honest about capability.
13. As a user who skipped Mac setup, I want recovery in **Account Surface**, so I can fix it later.
14. As a user, I want relationship onboarding inside **Companion Chat**, so onboarding feels relational.
15. As a user, I want the runtime-generated first opening (via **Conversation Start Trigger**), so the companion starts the relationship — not a client hardcoded welcome.
16. As a user, I want one continuous **Companion Chat** after setup, so returning feels like an ongoing relationship.
17. As a user, I want no dashboard, task board, streaks, or bottom tabs in V1.
18. As a user, I want a full-screen Liquid Glass Chat Shell, so conversation is primary.
19. As a user, I want a floating bottom Liquid Glass Composer, so sending feels native and integrated.
20. As a keyboard user, I want the composer to move with the keyboard safely.
21. As a mobile user, I want the composer to respect the bottom safe area.
22. As a user reading a long thread, I want scroll insets around the composer, so content is not hidden.
23. As a user, I want Intentive-owned message visuals, not vendor example styling.
24. As a user, I want streaming assistant responses, so the companion feels responsive.
25. As a user, I want clear loading, error, retry, and delivery states when a message fails.
26. As a user, I want subtle **Agent State** (available, thinking, following up, paused).
27. As a user, I want light continuity cues in chat, not a memory dashboard.
28. As a user, I want future nonstandard companion events to fit the chat surface.
29. As a user, I want **Account Surface** from a quiet affordance, without a header.
30. As a user, I want **Account Surface** as a sheet-like utility, not a primary destination.
31. As a user, I want signed-in identity visible in **Account Surface**.
32. As a user, I want logout from **Account Surface**.
33. As a user, I want Mac setup/connection status in **Account Surface**.
34. As a user, I want Routing / runtime connection status in **Account Surface**, so capability issues are legible.
35. As a user, I want app version and debug info for support.
36. As a user, I want support access from **Account Surface**.
37. As a developer, I want `assistant-ui/native` isolated as a replaceable Chat Primitive Engine.
38. As a developer, I want Intentive Chat Components to wrap vendor primitives locally.
39. As a developer, I want a **Protocol** client boundary (`packages/protocol/`), so the UI does not embed **Agent Runtime** logic.
40. As a developer, I want **Routing** via Control Plane `GET /agent` then a direct WebSocket to the **Agent Runtime** — Control Plane not on the message path.
41. As a developer, I want reconnect-snapshot hydration for **Conversation History**, not an on-device message database.
42. As a developer, I want a test double behind the same Protocol boundary for contract tests — not a shippable alternate chat mode.
43. As a tester, I want explicit exit criteria for the assistant-ui spike.

## Implementation Decisions

- Build V1 as Expo **Mobile Client**, not an **Agent Runtime**.
- Gate sequence: Launch resolver → **Identity Gate** → **Consent Primer** → **Sibling Client Invitation** → **Companion Chat** → **Account Surface**.
- Render gates as native screens; durable gate completion on **Control Plane** (**Cross-Client Gate** where applicable).
- **Companion Chat** connects via **Routing** + **Protocol** WebSocket; no Control Plane message proxying.
- No local durable **Conversation History**; hydrate from `hello_ok` / reconnect snapshot (#7).
- Notification permission on first chat entry, not at cold launch.
- Liquid Glass Chat Shell: no header, no bottom tabs, no productivity scaffolding.
- Spike `assistant-ui/native` behind Intentive Chat Components; eject early if customization fails.
- **Protocol** client (#6) owns send/stream/error/retry/Agent State reporting to UI layers.
- Capability honesty: UI must not imply the **Companion** acted unless runtime/control-plane state says so.

## Testing Decisions

- Assert user-visible state transitions, not vendor internals.
- Test launch resolver across signed-out, missing consent, missing sibling invitation, and ready-for-chat paths.
- Test gate progression and cross-client consent suppression (fixture scenarios).
- Test **Protocol** client contracts: send, stream, error, retry, Agent State, idempotent first opening.
- Test reconnect-snapshot hydration ordering and live append (#7) — not local DB reload.
- Test Liquid Glass Composer keyboard/safe-area/insets.
- Test notification permission is not requested at launch.
- Introduce tests alongside first modules.

## Out of Scope

- Building **Agent Runtime** or **DeepAgents** inside the mobile app.
- On-device **Conversation History** database or two-sided sync.
- Control Plane as a WebSocket message proxy.
- GCP provisioning from the client.
- Full memory editor, dashboards, multi-agent views, bottom tabs, header nav.
- Full notification system beyond APNs registration + **Post-Message-Back**-driven pushes (owned by runtime + CP).
- Tool-backed autonomous actions on-device.

## Further Notes

- Open issues: see [`ISSUE-BOARD.md`](../ISSUE-BOARD.md) and [GitHub](https://github.com/sruj75/Intentive/issues).
- Build order (current): shell/resolver → identity → consent → sibling invitation → assistant-ui spike → **Protocol** client → reconnect hydration → Liquid Glass shell → account → continuity UI → E2E polish.
- First ship should feel simple: one chat home, one composer, one quiet account affordance, native gates that get out of the way.
