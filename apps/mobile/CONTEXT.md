# Mobile Client

The iPhone-first client at `apps/mobile/`. For monorepo-wide language, read [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md).

## Mounted frontend language

**Mobile Client**:
The iPhone-first Intentive client owned by this deployable. Expo is its framework, not its product name.
_Avoid_: Expo app, mobile app

**Navigation Zone**:
An Expo Router grouping that selects a top-level journey without claiming business ownership. The Mobile Client has `(onboarding)` for A–D and `(main)` for E–L.
_Avoid_: route domain, screen domain

**Onboarding Journey**:
The in-memory B–D sequence after local authentication selection: full name, friends introduction, and permissions introduction. Its controller owns validation and transitions; the route does not.
_Avoid_: onboarding router, route-per-gate flow

**Profile Store**:
The non-durable provider seam carrying normalized full name, first name, and initials between Navigation Zones. Logout resets it; cold launch reconstructs it empty.
_Avoid_: user database, persisted profile

**Chat Mode**:
The presentation state of the shared chat surface: `welcome`, `education`, or `ready`. Reference E and K are the `welcome` and `ready` modes of the same component.
_Avoid_: second chat screen, ready route

**Education Deck**:
Five configurable frontend scenes explaining context, social reminders, memory, taste, and messages. It supports Continue, skip, horizontal swipe, and settings replay.
_Avoid_: feature routes, onboarding gate

**Conversation Timeline Item**:
The UI-owned union rendered by the conversation surface: capability card, suggestion group, user message, Companion message, or activity indicator. Runtime data must translate into this union.
_Avoid_: Protocol message in UI, server record in UI

**Conversation Session**:
The replaceable chat runtime contract exposing `getSnapshot`, `subscribe`, `send`, and `dispose`. The live route injects the Agent-Runtime-backed implementation; capability-free entrypoints use the deterministic local implementation.
_Avoid_: global controller, chat singleton

**Composer**:
The persistent bottom message control in the shared chat surface. Suggestions populate it and keyboard Send submits locally. Attachment and microphone affordances are visible but disabled.
_Avoid_: input bar, footer, text box

**Local Conversation Turn**:
The deterministic frontend sequence `user_sent → thinking → composing → replied`. Its timers are cancellable and it never calls the Agent Runtime.
_Avoid_: fake Runtime, simulated API call

**Production Integration Seams**:
The auth, Control Plane, Protocol, notification, and telemetry boundaries composed once by `src/entrypoints/platform.ts` and injected by live routes. Capability-free entrypoint defaults remain for deterministic frontend tests.
_Avoid_: dormant adapters, route-owned SDK client

## Production integration language

**Auth Adapter**:
The live Google-only boundary that exposes sign-in, sign-out, session restoration, and User JWT access while hiding native Google and Better Auth details.

**Launch State Resolver**:
The mounted pure function that maps Control-Plane-owned Pre-Chat Gate truth to a Launch Destination.

**Runtime Adapter**:
The live Mobile-internal Protocol WebSocket module. It owns handshake, ordering, reconnect recovery, delivery reconciliation, and the in-memory Message Store.

**Message Store**:
The Runtime Adapter's transient projection of server-truth Conversation History. It remains non-durable.

**Control Plane Source**:
A live account or Launch State reader backed by Control Plane HTTP contracts.

**Telemetry**:
The errors-only Sentry provider seam initialized by the composition root when a DSN is configured; a blank DSN keeps it the no-op.

## Relationships

- Expo Router selects a Navigation Zone; entrypoints compose domains and own no validation, timers, persistence, or domain records.
- The Onboarding Journey writes the Profile Store before replacing to `/chat`.
- The Education Deck changes Chat Mode without creating a route or second chat surface.
- Chat UI owns composer and overlay presentation; Conversation Session owns timeline phases and timer cleanup.
- Account UI owns session-only preferences and logout presentation.
- The conversation surface renders only Conversation Timeline Item values.
- Production Integration Seams enter mounted routes only through explicit provider/runtime translation boundaries.
