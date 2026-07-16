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
The replaceable chat runtime contract exposing `getSnapshot`, `subscribe`, `send`, and `dispose`. The mounted implementation is deterministic and in-memory.
_Avoid_: global controller, chat singleton

**Composer**:
The persistent bottom message control in the shared chat surface. Suggestions populate it and keyboard Send submits locally. Attachment and microphone affordances are visible but disabled.
_Avoid_: input bar, footer, text box

**Local Conversation Turn**:
The deterministic frontend sequence `user_sent → thinking → composing → replied`. Its timers are cancellable and it never calls the Agent Runtime.
_Avoid_: fake Runtime, simulated API call

**Dormant Production Adapters**:
Stable auth, Control Plane, Protocol, notification, and telemetry modules retained for later reconnection but unreachable from mounted entrypoints. Their presence does not imply a mounted capability.
_Avoid_: dead code, active production wiring

## Dormant production language

**Auth Adapter**:
The dormant boundary that hides concrete authentication providers and exposes sign-in, sign-out, and User JWT access.

**Launch State Resolver**:
The dormant pure function that maps Control-Plane-owned Pre-Chat Gate truth to a Launch Destination.

**Runtime Adapter**:
The dormant Mobile-internal Protocol WebSocket module. It owns handshake, ordering, reconnect recovery, delivery reconciliation, and the in-memory Message Store.

**Message Store**:
The dormant Runtime Adapter's transient projection of server-truth Conversation History. It remains non-durable.

**Control Plane Source**:
A dormant account or Launch State reader backed by Control Plane HTTP contracts.

**Telemetry**:
The dormant errors-only Sentry provider seam. The mounted Huracán frontend does not initialize it.

## Relationships

- Expo Router selects a Navigation Zone; entrypoints compose domains and own no validation, timers, persistence, or domain records.
- The Onboarding Journey writes the Profile Store before replacing to `/chat`.
- The Education Deck changes Chat Mode without creating a route or second chat surface.
- Chat UI owns composer and overlay presentation; Conversation Session owns timeline phases and timer cleanup.
- Account UI owns session-only preferences and logout presentation.
- The conversation surface renders only Conversation Timeline Item values.
- Dormant Production Adapters may be reconnected only through explicit provider/runtime translation seams.
