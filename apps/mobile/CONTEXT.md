# Mobile Client

The iOS Expo application — the chat surface. For monorepo-wide vocabulary and the context map, read the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md). This file captures vocabulary specific to the Mobile Client.

## Language

**Mobile Client**:
The iOS application, built with Expo, at `apps/mobile/`.
_Avoid_: Expo app, mobile surface, the mobile app

**Launch State Resolver**:
The single deep function that maps the current **Launch State** to one **Launch Destination**. It owns the entire **Pre-Chat Gate** ordering for the client; gate screens never decide what comes next.
_Avoid_: router guard, auth gate, redirect helper

**Launch State**:
The single **in-memory** store the **Launch State Resolver** reads — a transient _projection_ of the Control-Plane-owned **Pre-Chat Gate** truth, used only to drive navigation on this device. The client owns no durable gate state and persists nothing to disk; cold launch starts empty (→ `RESOLVING`) and hydrates from the source. Fields are nullable: a field is `null` while its answer is still unknown (token not yet read, `GET /me` not yet returned). Hydrated/reconciled by **Launch State Source**; a gate completing updates it optimistically. In v1 the durable source is the Control Plane's `GET /me`; #23 wires the real source at boot (stub scenarios remain for tests). See [`adr/0011`](docs/adr/0011-mobile-launch-state-as-in-memory-projection-of-cp-gate-truth.md).
_Avoid_: session state, app state, local gate store

**Launch State Source**:
The interface that hydrates and reconciles **Launch State** from the durable source of truth. Production boot uses `createControlPlaneLaunchStateSource` (`GET /me` + `AccountState` mapper); `createStubLaunchStateSource` remains for tests and dev scenarios. It writes _into_ the store; the resolver and layout never read it directly.
_Avoid_: gate repo, me-client

**Launch Destination**:
The resolver's output — exactly one of `RESOLVING`, `SIGNED_OUT`, `MISSING_CONSENT`, `SIBLING_INVITATION_PENDING`, `READY_FOR_CHAT`. `RESOLVING` means state is not yet known and the root layout shows the splash — so the resolver owns the splash decision too, not the layout. The root layout redirects to the matching route zone.
_Avoid_: screen, page, next step

**Launch Route**:
The route intent a **Launch Destination** maps to — either the splash (`RESOLVING`, state not yet known) or a replacement to exactly one route zone. A pure function (`onboarding/service/route-for-destination.ts`), the second half of the launch decision: the resolver answers _where the user stands_, the **Launch Route** answers _where that sends them_. The root layout's `RootNavigator` only runs the intent (`router.replace` to that zone); it never owns the mapping.
_Avoid_: href, redirect, route guard

**Gate Status**:
The state of a single **Pre-Chat Gate**: `pending | completed | skipped`. Uniform across all gates, though only the skippable **Sibling Client Invitation** ever takes `skipped`. Both `completed` and `skipped` let the resolver advance past a gate.
_Avoid_: done flag, gate boolean

**Auth Adapter**:
The single boundary the **Identity Gate** calls to obtain or drop a session — `signIn` / `signOut`. It hides which **Auth Provider** answered; nothing else in the Mobile Client imports an auth SDK. A deep module: a tiny interface over a volatile decision (which provider, what token shape). Its `getUserJwt()` is the **only** sanctioned way to read the **User JWT** — consumed by the **Runtime Adapter** to authorize `GET /agent` (#33), never by the UI. See [`adr/0012`](docs/adr/0012-mobile-auth-adapter-with-dev-provider.md).
_Avoid_: auth client, login service, OAuth wrapper

**Auth Provider**:
A concrete implementation behind the **Auth Adapter**. v1 has two: the **Neon Auth** provider (real Google/Apple sign-in, yields a verifiable **User JWT**, and owns its own session persistence), and the **Dev Auth Provider** (`__DEV__`-only, flips `signedIn` with no verifiable token). The Dev Auth Provider is launch-only — it unblocks gate/UI work without a backend, and cannot ship to production.
_Avoid_: identity provider (reserve that phrasing for Neon Auth itself)

**User JWT**:
The Neon Auth-issued token the **Neon Auth** provider returns on sign-in — the credential later passed through to `GET /me` and the Agent Runtime WebSocket, verified everywhere against the one shared Neon Auth JWKS (see root `CONTEXT-MAP.md`). The Mobile Client never mints or verifies it. The **Dev Auth Provider** does not produce one.
_Avoid_: session token, access token, runtime token

**Consent Primer**:
The **Pre-Chat Gate** shown to a signed-in user whose relationship has not yet consented — a short, trust-setting explainer of memory, follow-ups, and user control. A single affirmative screen (no decline path; `Gate Status` has no `declined`): accepting writes `consent: "completed"` into **Launch State** optimistically via the store mutator. The screen calls no auth SDK, no consent service, and **never requests notification permission**. The durable `POST /consent` and cross-client suppression are the Control Plane's (#26); the Mobile screen is unchanged when they land. See [`adr/0013`](docs/adr/0013-mobile-consent-primer-writes-launch-state-directly.md).
_Avoid_: consent screen, terms gate, privacy prompt, permission primer

**Sibling Client Invitation**:
The **Pre-Chat Gate** shown after the **Consent Primer** — a skippable, capability-honest invitation to set up the **Desktop Client** so the companion gets fuller context. It is static guidance only: an explainer of what connecting the Mac improves plus where to get it (no QR, deep link, email, or account pairing — pairing is the Control Plane's Device Registry, #27). Its only first-party action is **"Not now"**, which writes `siblingInvitation: "skipped"` into **Launch State** optimistically; the resolver advances to **Companion Chat**. The phone never claims the Mac connected — a real `completed` is server-observed (the Mac registers via #27 and `GET /me` reports it, #26); a `__DEV__`-only control exercises the completed path. No live detection in v1: a Mac that connects mid-session is picked up on the next state resolve (hydrate-on-mount, [`adr/0011`](docs/adr/0011-mobile-launch-state-as-in-memory-projection-of-cp-gate-truth.md)). A "required/blocking" variant is deferred — honest handling of "you need the Mac for this" is contextual in-chat (#41), not a launch block. See [`adr/0014`](docs/adr/0014-mobile-sibling-invitation-skippable-invite-screen.md).
_Avoid_: macOS onboarding, desktop pairing wizard, relationship onboarding, device-linking screen

**Companion Chat**:
The Mobile Client's single chat surface and the only chat UI in **Intentive** v1 — the **Companion** conversation rendered over **Conversation History** server-truth. Composed by `ui/companion-chat.tsx` (Intentive Chat Components over `@assistant-ui/react-native`, ADR 0009) and fed by the **Runtime Adapter**; it persists nothing locally.
_Avoid_: chat screen, conversation view, messenger, thread UI

**Runtime Adapter**:
The Mobile-internal deep module that owns the Protocol WebSocket transport and the in-memory **Message Store** it pushes into — handshake, idempotency, ordering, reconnect-snapshot recovery, live `companion_message` delivery, and `presence_update`/`delivery_ack` semantics — behind one chat-domain-friendly interface. Driven push-first via `useExternalStoreRuntime`, not the vendor turn-based `useLocalRuntime` ([adr/0015](docs/adr/0015-mobile-push-external-store-runtime-for-proactive-companion.md)). Imports `packages/protocol/`; the only place that speaks WebSocket.
_Avoid_: chat client, socket manager, ws client, transport layer

**Message Store**:
The Runtime Adapter's single **in-memory**, server-truth list of conversation messages — seeded from the `hello_ok` reconnect snapshot, appended by live events, deduped by `message_id`, ordered by the runtime. **Companion Chat** renders it via the external-store binding (#44); never written to disk (no SQLite/AsyncStorage). The push-side analogue of **Launch State**: a transient projection of Agent Runtime truth, owned here only to drive the UI.
_Avoid_: message database, local transcript, chat cache, message log

**Agent State**:
The Companion-status the chat surfaces — v1 has **Thinking** (an un-answered outbound `user_message` is in flight) and **Available** (otherwise). In v1 it is a **local inference** the **Runtime Adapter** derives from in-flight Protocol activity, **not** a runtime-reported signal: the Protocol has no `agent_state`/typing event, so a true server-emitted state is deferred to a later Protocol issue (Agent Runtime owns the emit side). Consequence of the local derivation: a proactive `companion_message` (Heartbeat/Cron/Post-Message-Back) arrives without a preceding **Thinking**, since nothing was sent to infer from. Honoring **capability-honesty**, the UI must not present this guess as authoritative runtime truth.
_Avoid_: typing indicator, presence, online status, runtime-reported state

**Delivery Status**:
The per-outbound-message state the chat surfaces for a `user_message` — `pending` (handed to the WebSocket, optimistically shown), `confirmed` (the same `message_id` has returned in server truth / a snapshot), or `failed` (socket dropped with the send still pending; retryable). The Protocol has **no** runtime→client receipt for a `user_message` (the wire `delivery_ack` runs the other way — the client acking an inbound `companion_message`), so confirmation is **reconcile-by-`message_id` against server truth**, not a receipt event. The client generates the `message_id` on send: **stable across a retry** of the same message (so it reconciles to one entry, not a duplicate), **distinct** for a new message — an idempotency key. The **Runtime Adapter** owns this reconciliation (it is the Q2 dedupe doing double duty); #33 exposes the statuses, #45 styles them. Pattern: Slack `client_msg_id` + Stripe idempotency key + optimistic UI.
_Avoid_: read receipt, sent/delivered ticks, ack status

## Relationships

- The **Launch State Resolver** reads **Launch State** and returns one **Launch Destination**.
- The root layout maps that **Launch Destination** to one **Launch Route** (`route-for-destination.ts`) and replaces to it; `RESOLVING` maps to the splash, not a redirect.
- A gate screen completing writes its **Gate Status** into **Launch State**; the root layout reactively redirects via the resolver. Gate screens never navigate forward themselves.
- **Pre-Chat Gate** ordering (Identity → Consent → Sibling Invitation → Chat) lives only inside the resolver.
- The **Identity Gate** calls the **Auth Adapter**; on success it writes `signedIn` into **Launch State** (the seam #18 left) and never navigates forward itself.
- The **Consent Primer** writes `consent: "completed"` into **Launch State** on accept (no service layer between screen and store); the resolver advances it to the next gate. Notification permission is never requested here and is never modeled as relationship consent.
- The **Sibling Client Invitation** writes `siblingInvitation: "skipped"` on "Not now"; a real `completed` is server-observed (the Mac registers via #27, surfaced by `GET /me` #26), never claimed by the phone. The resolver treats `skipped` and `completed` alike — both advance to **Companion Chat**.
- The **Auth Adapter** selects an **Auth Provider**; only the **Neon Auth** provider yields a **User JWT**. Verifying that **User JWT** is the Control Plane's job (#23), not the Mobile Client's.
- Two tokens, two hops: the **Runtime Adapter** uses `AuthAdapter.getUserJwt()` (the **User JWT**) to authorize the `GET /agent` HTTP call, then puts the **`runtime_jwt`** that call returns on the WebSocket `connect.auth_token`, treating it as an opaque ticket. `runtime_jwt` is the same Neon Auth token passed through (monorepo ADR-0002); the Runtime Adapter does not assume that and never reuses `getUserJwt()` for the socket.
- The **Runtime Adapter** obtains **Routing** (`{ ws_url, runtime_jwt, agent_instance_id }`) from the Control Plane `GET /agent`, then connects the WebSocket directly to the **Agent Runtime**; the Control Plane is off the message path after that. It maps routing failures: `503` → retry `GET /agent` with capped backoff, `401` → re-authenticate, `403` → re-check `GET /me` for the next **Pre-Chat Gate** before retrying.
- The first opening is authored by the **Agent Runtime** (Conversation Start Trigger), never by the client. "No duplicate openings" is a **free consequence** of server-side session-start idempotency plus **Message Store** dedupe by `message_id` — there is deliberately **no** bespoke first-opening tracking on the client.
- The **Runtime Adapter** reconciles each outbound `user_message` to its server-truth copy by `message_id` to drive **Delivery Status**; the same dedupe collapses any duplicated inbound message (including a re-triggered opening).
