# Mobile Client Architecture

## Bird's-eye Overview

The Mobile Client is an iPhone-first Expo deployable with two orthogonal structures:

- Expo Router owns navigation zones: `(onboarding)` serves A–D at `/`; `(main)` serves E–L at `/chat`.
- Layered domains own product behavior through `types → config → repo → service → runtime → ui`.

The mounted frontend preserves the A–L interaction contract while live routes inject production auth, Control Plane, notifications, telemetry, and Agent Runtime seams from one composition root. Capability-free entrypoint defaults keep the local A–L harness deterministic.

```text
app/_layout ──> Launch State + Notifications + Launch Curtain
      │
      ├── app/(onboarding) ──> OnboardingEntry ──> Google Auth + durable gates + onboarding
      │
      └── app/(main)/chat ──> ChatEntry ──> welcome | education | ready
                                      ├── Account State + settings UI
                                      └── ConversationSession
                                              ├── Runtime Adapter (live route)
                                              └── local session (offline default)
```

`(onboarding)` and `(main)` are navigation zones, not business domains. B2, K2, education pages, drawer/settings, F/G overlays, and L1–L4 remain component or domain-session state rather than routes.

## Codemap

- `app/_layout.tsx` — root gesture/profile/Launch State composition, navigation, push lifecycle, and launch curtain.
- `app/(onboarding)/` — headerless `/` route for A–D.
- `app/(main)/` — headerless `/chat` route for E–L.
- `src/entrypoints/` — cross-domain composition and Router replacement callbacks only.
- `src/domains/auth/` — Google-only Identity Gate presentation, Auth Adapter, and native Better Auth boundary.
- `src/domains/onboarding/` — B–D journey types, copy, validation/controller, Education Deck, and UI.
- `src/domains/chat/` — Conversation Timeline Item, local/runtime conversation implementations, drawer, composer, and shared E/K/L surface.
- `src/domains/account/` — settings copy and session-only settings/logout presentation.
- `src/domains/notifications/` — notification permission, Expo Push Token, device fingerprint, and Control Plane registration.
- `src/providers/profile/` — one non-durable Profile Store shared across Router zones.
- `src/providers/account-state/`, `launch-state/`, `telemetry/` — live Control Plane projections and errors-only telemetry.
- `src/design/` — global theme, brand identity, and prop-only visual primitives.
- `test/` — pure domain/session tests, live-seam boundary tests, Router lifecycle tests, and the 19-snapshot A–L journey.

## Architectural Invariants

- Within a domain, imports depend only on the same or a lower layer in `types → config → repo → service → runtime → ui`.
- Cross-domain access targets public `types/` contracts or is composed from `src/entrypoints/`; one domain never reaches into another domain's internal service/runtime/UI.
- Allowed Mobile `src/` roots are exactly `domains`, `providers`, `entrypoints`, `design`, and `index.ts`. Domain layers are exactly `types`, `config`, `repo`, `service`, `runtime`, `ui`, plus an explicit domain-local `providers` seam.
- `app/` contains routes and layouts only. Routes render an entrypoint and own no journey behavior.
- E and K are `welcome` and `ready` modes of one conversation surface. Education is a mode between them, not a second chat implementation.
- `ConversationTimelineItem` is UI-owned. Protocol or server records must be translated before reaching visual components.
- `ConversationSession` is the chat runtime seam: `getSnapshot`, `subscribe`, `send`, and `dispose`. Timers are cancellable on replacement turns and disposal.
- Profile and account settings are memory-only. Cold launch resolves Control-Plane gate truth before exposing `/` or `/chat`; logout resets profile state and replaces to `/`.
- Live routes may call only the capabilities injected by the composition root. Capability-free entrypoint defaults perform no auth, permissions, Contacts, notification, HTTP, WebSocket, SecureStore, durable storage, telemetry, Control Plane, or Agent Runtime calls.
- A–L copy, interactions, test IDs, and 390×844 snapshots are regression contracts during this architecture-only refactor.

These rules are enforced by the Intentive architecture ESLint plugin, including `mobile-source-structure`, layer direction, cross-domain/deployable checks, and Providers-only cross-cutting access.

## Boundaries

- Router boundary: the mounted onboarding route persists Consent Primer acceptance
  and Sibling Client Invitation skip through the Launch State source, reconciles
  `GET /me`, and lets the root resolver replace to `/chat` only from confirmed
  `READY_FOR_CHAT`. The capability-free entrypoint default still replaces
  locally; logout resets profile state and replaces to `/`.
- Profile boundary: `ProfileStore` exposes `getSnapshot`, `subscribe`, `setName`, and `reset`; it has no persistence adapter.
- Onboarding boundary: `OnboardingEntry` owns explicit consent and retry
  presentation; `OnboardingJourneyController` owns B–D transitions and name
  validation; the Launch State provider owns durable gate commands and
  reconciliation; `EducationDeckController` owns slide navigation, skip,
  completion, and reset.
- Conversation boundary: chat UI owns composer text, focus, gestures, and overlays; the injected `ConversationSession` owns either Runtime translation/WebSocket lifecycle or deterministic local reply timing.
- Account boundary: account UI owns settings copy and session-only preferences; composition passes only callbacks and the proactive-suggestions presentation value.
- Design boundary: `src/design/` is domain-agnostic and accepts props; domain-specific copy stays in each domain's `config/` layer.
- Production boundary: `src/entrypoints/platform.ts` constructs auth, Runtime Adapter, Control Plane, notification, and telemetry capabilities once; routes inject only their narrow public seams.

Future integrations must enter through the existing domain/provider seams and translate Runtime data into `ConversationTimelineItem`. They must not bypass Providers, add durable Mobile Conversation History, or put product logic in routes.

## Cross-cutting Concerns

- Auth, telemetry, and feature flags enter through `packages/providers/` or an explicit deployable/domain provider seam; the composition root initializes them and domains receive only injected ports.
- Safe areas, keyboard behavior, gestures, and motion use Expo-compatible React Native primitives and remain responsive across iPhone sizes.
- Disabled capabilities remain visible and accessibility-disabled until a separately approved integration mounts them.
- Pure behavior runs under `node:test`; Router/UI behavior and golden output run under Jest with React Native Testing Library.
- Required gates use Node 24 or newer: `pnpm lint:architecture:test`, `pnpm docs:check`, `pnpm lint`, and `pnpm harness --scope apps/mobile`.
