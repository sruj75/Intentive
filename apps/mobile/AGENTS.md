# Mobile Client — Agent Guide

iPhone-first Expo frontend for the Intentive Mobile Client. Read this file, the root [`AGENTS.md`](../../AGENTS.md), [`CONTEXT.md`](CONTEXT.md), and [`ARCHITECTURE.md`](ARCHITECTURE.md) before changing mounted behavior.

## Mounted frontend

The Huracán frontend preserves a locally simulated A–L journey while its production integrations remain unmounted.

- `(onboarding)` owns the `/` navigation zone for A–D.
- `(main)` owns the `/chat` navigation zone for E–L.
- B2, K2, Education Deck pages, F/G overlays, and L1–L4 are local state, not routes.
- Completion uses Router replacement to `/chat`; logout clears the in-memory profile and replaces to `/`.
- **Launch State drives cold-launch navigation** (ADR 0025): the root layout's `RootNavigator` resolves `GET /me` gate truth to `/` or `/chat`, so a signed-out launch stays on A while a fully-onboarded account resumes on `/chat`. The two-zone router re-target folds the six ADR-0011 gates onto the two live zones. Still no on-device persistence.

## Structure

```text
app/                         routes and headerless zone layouts only
src/entrypoints/             cross-domain composition only
src/domains/
  auth/                      A presentation and dormant production auth services
  onboarding/                B–D plus Education Deck
  chat/                      E/K/L, drawer, composer, local ConversationSession
  account/                   session settings and logout presentation
  notifications/             dormant production notification modules
src/providers/profile/       in-memory name and initials shared across zones
src/providers/*              dormant production provider seams
src/design/                  theme, brand identity, prop-only primitives
```

Every business domain follows `types → config → repo → service → runtime → ui`. Cross-domain behavior is composed in `src/entrypoints/`; do not reach into another domain's internal layer. Allowed source roots and domain layers are mechanically enforced, so never recreate a catch-all root.

## Frontend invariants

- E and K remain `welcome` and `ready` modes of one conversation component.
- UI renders `ConversationTimelineItem`, never Protocol shapes. **Chat Runtime is reconnected** (ADR 0026): the `(main)` route composes an Agent-Runtime-backed `ConversationSession` via `runtime-conversation-session.ts`, which translates Protocol `ConversationMessage`s → `ConversationTimelineItem[]` and Agent/connection state → `phase`, so `ConversationScene` still renders only timeline shapes.
- The `ConversationSession` is replaceable; the local one owns deterministic thinking/composing/reply timers and the runtime-backed one owns a live WebSocket. Either must release its work on replacement and disposal (the local cancels timers; the runtime `close`s the connection).
- Composer text, focus, gestures, drawer state, and account settings remain UI-owned.
- Domain copy belongs in that domain's `config/`; global theme, brand, and visual primitives belong in `src/design/`.
- The integration plan reconnects the dormant production seams one at a time through the `src/entrypoints/` composition root (`platform.ts` / `runtime-config.ts`), which `app/` route files inject. **Auth is reconnected** (ADR 0024): the `(onboarding)` route composes the real Auth Adapter, so the live Identity Gate makes real sign-in calls. **Launch State is reconnected** (ADR 0025): `app/_layout.tsx` mounts `LaunchStateProvider` with the real `GET /me` source and a `RootNavigator` that owns `/` ↔ `/chat` navigation. **Chat Runtime is reconnected** (ADR 0026): the `(main)/chat.tsx` route injects `getPlatform().createRuntimeSession()`, opening a real Agent Runtime WebSocket in place of the local session default. **Account State is reconnected** (ADR 0027): the same route injects `getPlatform().accountStateSource` so the shared `GET /me` projection gates Companion affordances (`deriveFeatureAccess` narrows proactive suggestions to accounts with a provisioned Agent instance); Launch State and this projection read through one shared Account State Source. **Notifications are reconnected** (ADR 0028): the `(main)/_layout.tsx` mounts a `NotificationsRegistrar` gated on `state.signedIn`, running `getPlatform().registerForPush()` once to request permission and `POST /devices/register`. **Telemetry is reconnected** (ADR 0029): the composition root runs `initTelemetry` and injects the real instance into every adapter, and `app/_layout.tsx` wraps the root with `wrapRoot`; a blank DSN keeps both the no-op. This completes the six-seam integration plan.
- Entrypoint components keep a capability-free offline default (no injected adapter/callbacks ⇒ no auth/HTTP/WebSocket/SecureStore/telemetry/notification calls). That default is what the `experience-journey` invariant test drives; every reconnected seam falls back to it with no injected adapter, and the still-dormant seams (Contacts, durable-storage, the runtime routing `POST /agent`) must make zero calls on that path too.
- Production modules not yet reached by the integration plan stay parked, not deleted or reconnected without extending the approved plan and recording an ADR.
- Preserve A–L visuals, copy, interactions, test IDs, and all 19 snapshots unless a later design task explicitly changes them.

## Verify

Use Node 24 or newer.

```bash
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile test
pnpm --dir apps/mobile test:rn
pnpm lint:architecture:test
pnpm docs:check
pnpm lint
pnpm harness --scope apps/mobile
```

Finish UI changes with an Expo Go smoke, then a 390×844 iPhone simulator walkthrough of A–L.
