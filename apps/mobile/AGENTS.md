# Mobile Client — Agent Guide

iPhone-first Expo frontend for the Intentive Mobile Client. Read this file, the root [`AGENTS.md`](../../AGENTS.md), [`CONTEXT.md`](CONTEXT.md), and [`ARCHITECTURE.md`](ARCHITECTURE.md) before changing mounted behavior.

## Mounted frontend

The Huracán frontend preserves a locally simulated A–L journey while its production integrations remain unmounted.

- `(onboarding)` owns the `/` navigation zone for A–D.
- `(main)` owns the `/chat` navigation zone for E–L.
- B2, K2, Education Deck pages, F/G overlays, and L1–L4 are local state, not routes.
- Completion uses Router replacement to `/chat`; logout clears the in-memory profile and replaces to `/`.
- Cold launch always begins at A. Do not add persistence.

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
- UI renders `ConversationTimelineItem`, never Protocol shapes.
- The local `ConversationSession` is replaceable and owns deterministic thinking/composing/reply timers; it must cancel them on replacement and disposal.
- Composer text, focus, gestures, drawer state, and account settings remain UI-owned.
- Domain copy belongs in that domain's `config/`; global theme, brand, and visual primitives belong in `src/design/`.
- Mounted code must make zero auth, Contacts, notification-permission, HTTP, WebSocket, SecureStore, durable-storage, telemetry, Control Plane, or Agent Runtime calls.
- Existing production modules are parked, not deleted or reconnected without an approved integration plan.
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
