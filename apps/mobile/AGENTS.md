# Mobile Client — Agent Guide

iPhone-first Expo frontend for the Intentive Mobile Client. Read this file, the root [`AGENTS.md`](../../AGENTS.md), [`CONTEXT.md`](CONTEXT.md), and [`ARCHITECTURE.md`](ARCHITECTURE.md) before changing mounted behavior.

## Mounted frontend

The Huracán frontend preserves the A–L journey while live routes compose production auth, Control Plane, notifications, telemetry, and Agent Runtime integrations. Entrypoint defaults remain capability-free for deterministic frontend tests.

- `(onboarding)` owns the `/` navigation zone for A–D.
- `(main)` owns the `/chat` navigation zone for E–L.
- B2, K2, Education Deck pages, F/G overlays, and L1–L4 are local state, not routes.
- Completion uses Router replacement to `/chat`; logout clears the in-memory profile and replaces to `/`.
- **Launch State drives cold-launch navigation** (ADR 0025): `src/entrypoints/root-entry.tsx` owns the root `RootNavigator` and resolves `GET /me` gate truth to `/` or `/chat`, while `app/_layout.tsx` stays composition-only. A signed-out launch stays on A and a fully-onboarded account resumes on `/chat`. The two-zone router re-target folds the six ADR-0011 gates onto the two live zones. Still no on-device persistence.

## Structure

```text
app/                         routes and headerless zone layouts only
src/entrypoints/             cross-domain composition only
src/domains/
  auth/                      A presentation and live Google-only auth boundary
  onboarding/                B–D plus Education Deck
  chat/                      E/K/L, drawer, composer, local/runtime ConversationSession
  account/                   session settings and logout presentation
  notifications/             push permission and device registration
src/providers/profile/       in-memory name and initials shared across zones
src/providers/*              live Launch/Account State and telemetry seams
src/design/                  theme, brand identity, prop-only primitives
```

Every business domain follows `types → config → repo → service → runtime → ui`. Cross-domain behavior is composed in `src/entrypoints/`; do not reach into another domain's internal layer. Allowed source roots and domain layers are mechanically enforced, so never recreate a catch-all root.

## Frontend invariants

- E and K remain `welcome` and `ready` modes of one conversation component.
- UI renders `ConversationTimelineItem`, never Protocol shapes. **Chat Runtime is reconnected** (ADR 0026): the `(main)` route composes an Agent-Runtime-backed `ConversationSession` via `runtime-conversation-session.ts`, which translates Protocol `ConversationMessage`s → `ConversationTimelineItem[]` and Agent/connection state → `phase`, so `ConversationScene` still renders only timeline shapes.
- The `ConversationSession` is replaceable; the local one owns deterministic thinking/composing/reply timers and the runtime-backed one owns a live WebSocket. Either must release its work on replacement and disposal (the local cancels timers; the runtime `close`s the connection).
- Composer text, focus, gestures, drawer state, and account settings remain UI-owned.
- Domain copy belongs in that domain's `config/`; global theme, brand, and visual primitives belong in `src/design/`.
- The six production seams enter through the `src/entrypoints/` composition root (`platform.ts` / `runtime-config.ts`), which live `app/` routes inject: Google-only Auth (ADRs 0024/0030), Launch State (0025), Chat Runtime (0026), Account State (0027), Notifications (0028/0030), and Telemetry (0029).
- Entrypoint components keep a capability-free offline default (no injected adapter/callbacks ⇒ no auth/HTTP/WebSocket/SecureStore/telemetry/notification calls). That default is what the `experience-journey` invariant test drives; Contacts and durable storage remain parked and must make zero calls on that path.
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

Finish UI changes with an EAS-built Expo Development Client smoke in a 390×844 iPhone Simulator, then walk through A–L.
