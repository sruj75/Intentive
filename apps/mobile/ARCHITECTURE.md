# Mobile Client Architecture

For Mobile Client vocabulary, see [`CONTEXT.md`](CONTEXT.md); for the context map and shared product language, see the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md). For the cross-deployable architecture and layer rule, see [`ARCHITECTURE.md`](../../ARCHITECTURE.md). This file describes Mobile Client-specific structure only.

## Bird's-eye Overview

The Mobile Client is an iOS-first Expo app — one of three Clients that talk to the Intentive Agent Runtime. It is **not** the Agent Runtime, the Control Plane, or any kind of server. It is the only Client with a chat surface in v1 (Desktop is capture-only; Android is future).

The app owns native onboarding screens, the Liquid Glass Chat Shell, Intentive Chat Components, the Runtime Adapter (Mobile-internal Protocol WebSocket client), notification permission flow, and the Account Surface. **Conversation History is server-truth, owned by the Agent Runtime — the Mobile Client does not persist messages locally.** Identity, device registry, Pre-Chat Gate state, and Routing live in the Control Plane.

The V1 product spine is:

Launch state → Identity Gate → Consent Primer → Sibling Client Invitation (skippable) → Liquid Glass Companion Chat (Companion's bootstrap-guided opening lands here) → Account Surface for utility and recovery.

V1 optimizes for one calm continuous chat, visible Companion state, capability honesty, and a single source of truth for every piece of knowledge. It must not grow into tabs, dashboards, task boards, streaks, or a local Agent Runtime.

Enforceable import boundaries and explicit provider interfaces are now wired at the repo root (architecture lint + `packages/providers/`). The deployable-specific work is to keep each domain shallow at the right layer and resist re-introducing a local Conversation Store, a chat surface for proactive-Companion features that already belong in `chat/`, or any direct import of `apps/desktop/` or `services/` source.

## Codemap

Root shape (v1 foundation — Pre-Chat Gate screens through Sibling Invitation (#19–#21); Chat Primitive Engine spike (#22) landed as `CompanionChat` + dev adapter; resolver + launch-state provider wired):

- `app/`: Expo Router routes only — thin shells grouped by UX context (`(gates)`, `(chat)`; `(account)/` when Account Surface lands). No reusable components or logic live here; a route file imports and composes a domain's `ui` export and nothing else. This is the **navigation axis**, deliberately distinct from the capability axis below (see [`adr/0010`](docs/adr/0010-mobile-navigation-and-capability-as-orthogonal-axes.md)).
- `src/domains/auth/`: **Auth Adapter** (`service/`) and **Identity Gate** (`ui/`) — Neon Auth and launch-only Dev providers behind one `signIn`/`signOut` boundary (ADR 0012). Session persistence is owned by the Neon Auth SDK; the Mobile Client does not verify **User JWT**s (#23). A screen lives where its logic lives, so the Identity Gate is owned here, not by `onboarding`.
- `src/domains/chat/`: Companion Chat domain — `ui/companion-chat.tsx` (Intentive Chat Components over `@assistant-ui/react-native`, ADR 0009), `runtime/dev-chat-adapter.ts` (MVP dev seam; Protocol adapter in #33), future Runtime Adapter usage, Agent State display. Reads Conversation History from the WebSocket reconnect snapshot; does not persist messages. Routes import `CompanionChat` only — no vendor types in `app/`.
- `src/domains/onboarding/`: the Pre-Chat Gate **sequence** — the Consent Primer and Sibling Client Invitation screens, plus the launch decision in `service/`: the **Launch State Resolver** (`resolve-launch-state.ts`, gate ordering) and **Launch Route** (`route-for-destination.ts`, `LaunchDestination →` splash or one route zone). The Identity Gate screen itself lives in `auth/`; `onboarding` only decides when to show it (by resolving to `SIGNED_OUT`). The Companion's bootstrap-guided opening message renders inside `chat/`, not here.
- `src/domains/notifications/`: APNs token registration with the Control Plane (via `POST /devices/register`), permission ask on first chat entry, push intent surfaces.
- `src/domains/account/`: Account Surface, logout, setup recovery, connection status, and debug status.
- `src/providers/`: explicit provider interfaces — auth (Neon JWKS verify), Control Plane HTTP client (from `packages/api-contract/`), the Protocol WebSocket client (from `packages/protocol/`), platform capabilities (notifications, secure storage), telemetry, and feature flags. Cross-cutting only enters domains through here.
  - `src/providers/launch-state/`: the shared **Launch State** — its `types`, the `LaunchStateSource` seam (`createControlPlaneLaunchStateSource` for `GET /me`; stub for tests), and the in-memory `store` (`LaunchStateProvider` + `useLaunchState`). It lives here, not in a domain, because both `auth` (Identity Gate writes `signedIn`) and `onboarding` (Consent/Sibling write their `GateStatus`) mutate it; a store inside one domain would be a banned cross-domain import. The **resolver** itself stays in `onboarding/service/` and imports only these provider types.
- `src/design/`: design tokens from `DESIGN.md`, theme helpers, and appearance resolution.
- `src/dev-companion/`: MVP-only development companion implementing the same Protocol contract as the real Agent Runtime.
- `src/testing/`: contract fixtures and test helpers shared across domains.

Domain-internal layer order:

Types -> Config -> Repo -> Service -> Runtime -> UI

Each business domain may use those layers, but should not create all of them unless the layer hides real complexity. Shallow files are worse than fewer deeper modules.

Primary deep modules:

- **Runtime Adapter** (Mobile-internal name for the Protocol WebSocket client): hides handshake, idempotency, ordering, reconnect-snapshot recovery, `companion_message` streaming, `presence_update`/`delivery_ack` semantics, and future inbound event types behind one chat-domain-friendly interface. Imports `packages/protocol/`.
- **Intentive Chat Components**: hide `assistant-ui/native` (or any future chat primitive engine) behind local product components — Liquid Glass message rows, composer, agent-state indicator.
- **Launch State Resolver** + **Launch Route** (`onboarding/service/`): the resolver hides Pre-Chat Gate branching behind `LaunchState → LaunchDestination`; `route-for-destination.ts` maps each destination to a splash or a single redirect href. Gate screens never choose the next step — they write `GateStatus` into `LaunchState`; `app/_layout.tsx` runs `router.replace` on the mapped href only. The resolver receives `signedIn` as plain input (no `auth` import). In v1 `LaunchState` is sourced from Control Plane's `GET /me` via `createControlPlaneLaunchStateSource` + `mapAccountStateToLaunchState`.
- **Design Theme**: hides light/dark token resolution and platform appearance details.

## Architectural Invariants

The Mobile Client talks **directly** to the Agent Runtime over a WebSocket using the Protocol from `packages/protocol/`. The Control Plane is **not** on the data path — it only issues Routing (Agent Runtime URL + JWT) via `GET /agent` before the WebSocket opens.

The Mobile Client never owns durable shared identity, the Device Registry, Pre-Chat Gate state, Conversation History, APNs credentials, or proactive Companion behavior. Those belong to the Control Plane and Agent Runtime.

The first real relationship-forming conversation happens only after Identity Gate and Consent Primer.

Sibling Client Invitation (macOS Setup) happens before Companion Chat, but is skippable. It does not block entry into chat.

Companion Chat is the V1 home. No bottom tabs, primary dashboard, task board, streak system, calendar shell, or conventional productivity frame.

The Account Surface is utility, not primary navigation. It is opened through a visible but quiet Account Affordance.

`assistant-ui/native` is replaceable infrastructure. Vendor visuals, route shape, persistence model, or backend assumptions must not leak into product components.

**Conversation History is server-truth, owned by the Agent Runtime in Neon.** The Mobile Client renders the authoritative timeline streamed back on WebSocket reconnect; it stores nothing locally — not even as a cache — until measured latency proves one is needed.

Notification permission is asked **on first entry into chat**, framed around delivering Companion messages. Not at launch.

Agent State must be capability-honest. The UI must not imply the Companion read, acted, scheduled, or connected anything unless the Agent Runtime actually did.

## Boundaries

`app/` may import route screens only. Route files compose domain UI but do not contain business logic, persistence, runtime calls, or reusable components.

UI code may call Services or Runtime facades, not provider implementations directly. Layer direction (`types → config → repo → service → runtime → ui`) is enforced by the architecture lint rules — see [`ARCHITECTURE.md`](../../ARCHITECTURE.md).

Repo code owns local-storage details (secure storage of auth tokens, settings, telemetry buffer). **No chat-message repo exists** — Conversation History is read from the WebSocket reconnect snapshot, not from a local DB.

Runtime code owns transport details. Chat UI must not know whether the assistant response comes from the Dev Companion or the production Agent Runtime — both speak the same Protocol from `packages/protocol/`.

Providers are the only approved path to cross-cutting systems: auth (JWKS verify), Control Plane HTTP, the Protocol WebSocket client, storage, notifications, telemetry, platform APIs, and feature flags. Shared providers may come from `packages/providers/` at the repo root.

`assistant-ui/native` may appear only inside the Chat Primitive Engine wrapper layer. If imports spread into routes or unrelated domains, the dependency is leaking.

Design tokens come from `DESIGN.md` through `src/design/`. Components should consume semantic theme values, not hard-code product colors.

WebSocket events arrive as Zod-validated `packages/protocol/` types. They are used directly as the domain model where the shapes are a perfect fit; a translation layer is only added if a domain needs a different shape than the wire format provides.

## Cross-cutting Concerns

Testing should assert user-visible behavior and contracts, not vendor internals or style object details.

Required contract tests:

- Auth Adapter: provider selection, disabled providers return `not-configured` without opening OAuth, Neon outcome mapping, dev provider `__DEV__` gating (Node).
- Identity Gate: success writes `signedIn` via the launch-state seam; recoverable failure surfaces (RN harness).
- Consent Primer: trust-setting copy; accept writes `consent: "completed"` via the launch-state seam (RN harness).
- Sibling Client Invitation: skip writes `siblingInvitation: "skipped"`; production UI never self-attests `completed` (RN harness).
- Launch state resolver + Launch Route: signed out, missing Consent Primer, sibling-invitation pending, entry to Companion Chat; `RESOLVING` stays on splash (Node).
- Runtime Adapter (Protocol WebSocket client): `connect` handshake with the Control Plane-issued JWT, render reconnect snapshot, handle live `companion_message` chunks, surface `delivery_ack`s for sent messages, reconnect cleanly after a drop.
- Chat Components: custom user/assistant rows, streaming, loading, error, retry.
- Composer layout: keyboard safety, safe area, scroll inset correctness.
- Permission behavior: notification prompt fires on first chat entry, not at launch.

Mechanical checks (already wired at the repo root — see [`ARCHITECTURE.md`](../../ARCHITECTURE.md)):

- Layer-direction lint (`types → config → repo → service → runtime → ui`).
- No-cross-deployable lint (no relative imports into `apps/desktop/` or `services/`).
- Ban reusable components under `app/` (route-only directory).
- Ban direct `assistant-ui/native` imports outside the chat primitive wrapper.
- Accessibility and contrast checks for light and dark chat surfaces.

Design complexity rule: when a new feature needs shared knowledge in multiple places, first ask whether a deeper module should own that knowledge. Prefer one deep boundary over several shallow wrappers.
