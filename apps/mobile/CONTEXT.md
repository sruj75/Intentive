# Mobile Client

The iPhone-first Expo client at `apps/mobile/`. For monorepo-wide language, read [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md).

## Current phase

The mounted product is the **Local Experience**: a Genie-inspired frontend foundation used to approve the A-to-L journey before Intentive content and production wiring return. Everything is in-memory and reconstructs from A on cold launch.

Existing auth, Control Plane, Protocol, notification, telemetry, and Agent Runtime adapter modules are **Dormant Production Adapters**. Their vocabulary below remains canonical for later reconnection, but they are not capabilities of the mounted experience.

## Mounted-experience language

**Local Experience**:
The scene-driven, frontend-only A-to-L journey mounted by `app/index.tsx`. It renders real controls and local interactions but performs no authentication, permissions, Contacts, network, notification, persistence, or Runtime work.
_Avoid_: demo screens, cardboard prototype, mock app

**Experience Controller**:
The deep local module that maps **Experience Events** into an immutable **Experience Snapshot**. It owns sequencing, validation, overlays, session settings, education progress, composer state, response timers, reset, and cleanup.
_Avoid_: navigation state, screen reducer, onboarding router

**Experience Snapshot**:
The complete in-memory UI state exposed by the **Experience Controller**: scene, chat mode, name, education index, overlay, settings, composer, timeline, and chat phase. It is never durable.
_Avoid_: session state, app state, backend state

**Experience Event**:
A user or local-timer intent dispatched to the **Experience Controller**. Visual components dispatch events instead of choosing the next scene themselves.
_Avoid_: route action, API action

**Chat Mode**:
The two states of the single chat scene: `welcome` is reference E and `ready` is reference K/L. Education changes the mode; it does not replace the chat surface.
_Avoid_: welcome screen, second chat screen, chat route

**Education Deck**:
Five configurable frontend scenes explaining context, social reminders, memory, taste, and messages. It supports Continue, skip, and horizontal swipe. Settings can replay it.
_Avoid_: onboarding gate, feature routes

**Conversation Timeline Item**:
The UI-owned union rendered by the conversation surface: capability card, suggestion group, user message, Companion message, or activity indicator. Future Runtime events must translate into this union.
_Avoid_: Protocol message in UI, server record in UI

**Composer**:
The persistent bottom message control in the shared chat surface. Suggestions populate it and keyboard Send submits locally. Attachment and microphone affordances are visible but disabled.
_Avoid_: input bar, footer, text box

**Local Conversation Turn**:
The deterministic frontend sequence `user_sent → thinking → composing → replied`. Its timers are cancellable and it never calls the Agent Runtime.
_Avoid_: fake Runtime, simulated API call

**Replaceable Content**:
The typed Genie-facing manifest in `src/experience/content.ts`: copy, education definitions, suggestions, capability content, and local replies.
_Avoid_: hard-coded screen copy

**Replaceable Theme**:
The light iPhone token set in `src/experience/theme.ts`: color, typography, spacing, radii, shadow intent, and motion.
_Avoid_: per-screen styles, Genie skin

## Dormant production language

**Dormant Production Adapters**:
Stable source modules retained for later reconnection but unreachable from the mounted `app/` → `src/experience/` import tree. Their presence does not imply the capability works.
_Avoid_: dead code, active backend wiring

**Auth Adapter**:
The dormant boundary that hides concrete authentication providers and exposes sign-in, sign-out, and User JWT access.

**Launch State Resolver**:
The dormant pure function that maps Control-Plane-owned Pre-Chat Gate truth to a Launch Destination. It is not mounted during the Local Experience phase.

**Runtime Adapter**:
The dormant Mobile-internal Protocol WebSocket module. It owns handshake, ordering, reconnect recovery, delivery reconciliation, and the in-memory Message Store.

**Message Store**:
The dormant Runtime Adapter’s transient projection of server-truth Conversation History. It remains non-durable.

**Control Plane Source**:
A dormant account or Launch State reader backed by Control Plane HTTP contracts.

**Telemetry**:
The dormant errors-only Sentry provider seam. The Local Experience does not initialize it.

## Relationships

- Expo Router mounts one **Local Experience** and owns no journey decisions.
- The **Experience Controller** publishes one **Experience Snapshot**; UI components render it and dispatch **Experience Events**.
- Reference E and K share one component and differ only by **Chat Mode**.
- The **Education Deck** transitions `welcome` to `ready`; replay does not create another chat surface.
- The conversation surface renders only **Conversation Timeline Item** values.
- **Replaceable Content** and **Replaceable Theme** are the intended Huracán-to-Intentive renovation seams.
- **Dormant Production Adapters** may be reconnected only through a future translation boundary into the controller/timeline model.
