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
The resolver's output — exactly one of `RESOLVING`, `SIGNED_OUT`, `MISSING_CONSENT`, `MISSING_ONBOARDING`, `SIBLING_INVITATION_PENDING`, `MISSING_TRIAL`, `READY_FOR_CHAT`. `RESOLVING` means state is not yet known and the root layout shows the splash — so the resolver owns the splash decision too, not the layout. The root layout redirects to the matching route zone.
_Avoid_: screen, page, next step

**Launch Route**:
The route intent a **Launch Destination** maps to — either the splash (`RESOLVING`, state not yet known) or a replacement to exactly one route zone. A pure function (`onboarding/service/route-for-destination.ts`), the second half of the launch decision: the resolver answers _where the user stands_, the **Launch Route** answers _where that sends them_. The root layout's `RootNavigator` only runs the intent (`router.replace` to that zone); it never owns the mapping.
_Avoid_: href, redirect, route guard

**Gate Status**:
The state of a single **Pre-Chat Gate**: `pending | completed | skipped`. Uniform across all gates, though only the skippable **Sibling Client Invitation** ever takes `skipped`. Both `completed` and `skipped` let the resolver advance past a gate.
_Avoid_: done flag, gate boolean

**Auth Adapter**:
The single boundary the **Identity Gate** calls to obtain or drop a session — `signIn` / `signOut`. It hides which **Auth Provider** answered; nothing else in the Mobile Client imports an auth SDK. A deep module: a tiny interface over a volatile decision (which provider, what token shape). Its `getUserJwt()` is the **only** sanctioned way to read the **User JWT** — consumed by the **Runtime Adapter** to authorize `GET /agent`, never by the UI. See [`adr/0012`](docs/adr/0012-mobile-auth-adapter-with-dev-provider.md).
_Avoid_: auth client, login service, OAuth wrapper

**Auth Provider**:
A concrete implementation behind the **Auth Adapter**. v1 has two: the **Neon Auth** provider (real Google/Apple sign-in, yields a verifiable **User JWT**, and owns its own session persistence), and the **Dev Auth Provider** (`__DEV__`-only, flips `signedIn` with no verifiable token). The Dev Auth Provider is launch-only — it unblocks gate/UI work without a backend, and cannot ship to production.
_Avoid_: identity provider (reserve that phrasing for Neon Auth itself)

**User JWT**:
The Neon Auth-issued token the **Neon Auth** provider returns on sign-in — the credential later passed through to `GET /me` and the Agent Runtime WebSocket, verified everywhere against the one shared Neon Auth JWKS (see root `CONTEXT-MAP.md`). The Mobile Client never mints or verifies it. The **Dev Auth Provider** does not produce one.
_Avoid_: session token, access token, runtime token

**Telemetry**:
The Mobile Client's errors-only Sentry seam. It captures unhandled runtime failures and explicitly reported **Runtime Adapter** / **Auth Adapter** failures through `src/providers/telemetry`, without performance tracing, replay, profiling, conversation bodies, or **Conversation History** payloads. Domains depend only on the `Telemetry` port; `@sentry/react-native` stays behind the provider.
_Avoid_: analytics, session replay, tracing, observability SDK

**Get Started**:
The pre-auth landing — the first thing a cold, signed-out user sees, rendered as the first screen of the signed-out `/(gates)/identity` zone before the sign-in options. It is **not** a **Pre-Chat Gate** (there is no signed-in truth to project yet): it carries no **Launch State** field and steps forward locally to the **Identity Gate**, never across a gate boundary. Copy explains continuity, not features; the hero art is deferred (a blank themed panel in the scaffold).
_Avoid_: welcome carousel, intro slides

**Consent Primer**:
The **Pre-Chat Gate** shown to a signed-in user who has not yet accepted data & privacy terms — the **Data & Privacy** screen: what data Intentive collects and how it is processed, plus links to the Privacy Policy & Terms of Service. A single affirmative screen (no decline path; `Gate Status` has no `declined`): "Agree & Continue" is acceptance of the terms and writes `consent: "completed"` into **Launch State** optimistically via the store mutator. The screen calls no auth SDK, no consent service, and **never requests notification permission** — that is the separate **Grant Permissions** screen. The durable `POST /consent` and cross-client suppression are the Control Plane's (#26); the Mobile screen is unchanged when they land. See [`adr/0013`](docs/adr/0013-mobile-consent-primer-writes-launch-state-directly.md). The earlier "memory, follow-ups, and user control" framing was wrong; relationship/memory explanation lives in-chat (ADR-0006 as superseded), not here.
_Avoid_: consent screen, permission primer

**Onboarding**:
The single collapsed **Pre-Chat Gate** for the one-time personalization funnel — name → **Acquisition Source** ("How did you find us?") → **Grant Permissions** — shown after the **Consent Primer**. These three steps never independently re-trigger, so they are one gate (`onboarding: "completed"`), not three: the funnel's screens step forward with local state _below_ the resolver's granularity (the resolver reports `MISSING_ONBOARDING` throughout), and only the last step writes the **Gate Status**. Modeled on the industry-norm "onboarding complete" flag. The entered name is intentionally not modeled in **Launch State** — persisting it is a later Control Plane concern. See [`adr/0019`](docs/adr/0019-mobile-onboarding-funnel-collapses-to-one-gate.md).
_Avoid_: profile setup, signup wizard, onboarding carousel

**Grant Permissions**:
The last step of the **Onboarding** funnel — an omi-style, deliberately simple notification-permission ask (notifications only; no location prompt). Continue fires the OS permission prompt and then advances, always, whatever the user answers. The ask is _injected_ into the step (the `(onboarding)` route wires the real `expo-notifications` port), so the `onboarding` domain imports nothing notification-related. This moves the permission **prompt** earlier than "first chat entry"; registering the Expo Push Token still happens around first chat entry, and the port does not re-prompt once permission is decided.
_Avoid_: permission primer, soft ask

**Sibling Client Invitation**:
The **Pre-Chat Gate** shown after the **Consent Primer** — a skippable, capability-honest invitation to set up the **Desktop Client** so the companion gets fuller context. It is static guidance only: an explainer of what connecting the Mac improves plus where to get it (no QR, deep link, email, or account pairing — pairing is the Control Plane's Device Registry, #27). Its only first-party action is **"Not now"**, which writes `siblingInvitation: "skipped"` into **Launch State** optimistically; the resolver advances to **Companion Chat**. The phone never claims the Mac connected — a real `completed` is server-observed (the Mac registers via #27 and `GET /me` reports it, #26); a `__DEV__`-only control exercises the completed path. No live detection in v1: a Mac that connects mid-session is picked up on the next state resolve (hydrate-on-mount, [`adr/0011`](docs/adr/0011-mobile-launch-state-as-in-memory-projection-of-cp-gate-truth.md)). A "required/blocking" variant is deferred — honest handling of "you need the Mac for this" is contextual in-chat (#41), not a launch block. See [`adr/0014`](docs/adr/0014-mobile-sibling-invitation-skippable-invite-screen.md).
_Avoid_: macOS onboarding, desktop pairing wizard, relationship onboarding, device-linking screen

**Free Trial**:
The **Pre-Chat Gate** just before **Companion Chat** — a cosmetic trial-offer screen whose single action writes `trial: "completed"` and lets the resolver advance to chat. Its own gate (not folded into **Onboarding**) because the entitlement re-checks on expiry: a lapsed user sees it again, a subscriber never does. v1 is cosmetic only — the button just advances; StoreKit/billing, real entitlements, and a Control-Plane-reported trial state are deferred (`packages/api-contract`). See [`adr/0019`](docs/adr/0019-mobile-onboarding-funnel-collapses-to-one-gate.md).
_Avoid_: paywall, upsell

**Companion Chat**:
The Mobile Client's single chat surface and the only chat UI in **Intentive** v1 — the **Companion** conversation rendered over **Conversation History** server-truth. Composed by `ui/companion-chat.tsx` (Intentive Chat Components over `@assistant-ui/react-native`, ADR 0009) and fed by the **Runtime Adapter**; it persists nothing locally.
_Avoid_: chat screen, conversation view, messenger, thread UI

**Account Affordance**:
The quiet control reserved for account and setup utility from **Companion Chat** without turning account into primary navigation. It is visible enough to recover settings and setup, but it is not a header, tab, or active chat tool.
_Avoid_: settings tab, account tab, header button, chat tool

**Account Surface**:
The sheet-like utility surface opened from the **Account Affordance**. It owns identity visibility, logout, app/support information, connection status, and manual **Desktop Client** setup recovery. It may offer setup or reconnection guidance, but it must not claim the Mac is connected unless server-owned account/device state proves it.
_Avoid_: settings, settings screen, settings page, account page, Mac connected screen

**Connection Status**:
The simple usability state the **Account Surface** shows for whether Intentive can currently reach what it needs for chat. It is user-facing and coarse: connected, reconnecting, connection issue, or not configured. It is not a diagnostics panel for separating Control Plane failures from Agent Runtime failures.
_Avoid_: server diagnostics, socket status, backend health, runtime health

**Composer**:
The bottom floating message control in **Companion Chat** where the user drafts and sends messages. It is a persistent chat control, not a footer or onboarding prompt, and it stays usable with keyboard, safe-area, and larger text settings.
_Avoid_: input bar, footer, text box, onboarding prompt

**Runtime Adapter**:
The Mobile-internal deep module that owns the Protocol WebSocket transport and the in-memory **Message Store** it pushes into — handshake, idempotency, ordering, reconnect-snapshot recovery, live `companion_message` delivery, and `presence_update`/`delivery_ack` semantics — behind one chat-domain-friendly interface. Driven push-first via `useExternalStoreRuntime`, not the vendor turn-based `useLocalRuntime` ([adr/0015](docs/adr/0015-mobile-push-external-store-runtime-for-proactive-companion.md)). Imports `packages/protocol/`; the only place that speaks WebSocket.
_Avoid_: chat client, socket manager, ws client, transport layer

**Message Store**:
The Runtime Adapter's single **in-memory**, server-truth list of conversation messages — seeded from the `hello_ok` reconnect snapshot, appended by live events, deduped by `message_id`, ordered by the runtime. **Companion Chat** renders it via the external-store binding (#44); never written to disk (no SQLite/AsyncStorage). The push-side analogue of **Launch State**: a transient projection of Agent Runtime truth, owned here only to drive the UI.
_Avoid_: message database, local transcript, chat cache, message log

**Protected Opening**:
The Companion's first runtime-authored message when a relationship first enters **Companion Chat**. It is ordinary chat content, not a separate onboarding mode; while it is arriving, the user may draft, but no user message is committed or sent until the opening lands.
_Avoid_: onboarding mode, welcome screen, client welcome, first-run chat mode

**Agent State**:
The Companion-status the chat surfaces: **Available**, **Thinking**, **Following up**, and explicit-only **Paused**. **Thinking** is a local inference from pending outbound `user_message` delivery. **Following up** is shown only from server truth (`companion_message.via_post_message_back` or the same flag in a reconnect snapshot). **Paused** is never inferred from errors or idle connection state; it renders only when an explicit product boundary supplies it. The Protocol has no general `agent_state`/typing event, so the UI must not present local guesses as authoritative runtime truth.
_Avoid_: typing indicator, presence, online status, runtime-reported state

**Delivery Status**:
The per-outbound-message state the chat surfaces for a `user_message` — `pending` (handed to the WebSocket, optimistically shown), `confirmed` (the same `message_id` has returned in server truth / a snapshot), or `failed` (socket dropped with the send still pending; retryable). The Protocol has **no** runtime→client receipt for a `user_message` (the wire `delivery_ack` runs the other way — the client acking an inbound `companion_message`), so confirmation is **reconcile-by-`message_id` against server truth**, not a receipt event. The client generates the `message_id` on send: **stable across a retry** of the same message (so it reconciles to one entry, not a duplicate), **distinct** for a new message — an idempotency key. The **Runtime Adapter** owns this reconciliation (it is the Q2 dedupe doing double duty); #45 styles the surfaced statuses. Pattern: Slack `client_msg_id` + Stripe idempotency key + optimistic UI.
_Avoid_: read receipt, sent/delivered ticks, ack status

## Relationships

- The **Launch State Resolver** reads **Launch State** and returns one **Launch Destination**.
- The root layout maps that **Launch Destination** to one **Launch Route** (`route-for-destination.ts`) and replaces to it; `RESOLVING` maps to the splash, not a redirect.
- A gate screen completing writes its **Gate Status** into **Launch State**; the root layout reactively redirects via the resolver. Gate screens never navigate forward themselves.
- **Pre-Chat Gate** ordering (Identity → Consent → **Onboarding** → Sibling Invitation → **Free Trial** → Chat) lives only inside the resolver. **Get Started** precedes the Identity Gate inside the signed-out zone but is not a gate — it carries no **Launch State** field and steps forward locally.
- The **Identity Gate** calls the **Auth Adapter**; on success it writes `signedIn` into **Launch State** (the seam #18 left) and never navigates forward itself.
- The **Account Surface** shows signed-in identity only through the **Auth Adapter** or Control-Plane-owned account state. It never imports a concrete **Auth Provider** or auth SDK to read profile details.
- The **Consent Primer** (the **Data & Privacy** screen) writes `consent: "completed"` into **Launch State** on accept (no service layer between screen and store); the resolver advances it to the next gate. Notification permission is never requested here — that is the separate **Grant Permissions** step.
- The **Onboarding** funnel collapses name → **Acquisition Source** → **Grant Permissions** into one gate: its screens step forward with local state and write nothing until the last step writes `onboarding: "completed"`. The **Grant Permissions** step takes an injected notification-permission ask (wired by the `(onboarding)` route), so the `onboarding` domain never imports the `notifications` domain.
- The **Free Trial** gate writes `trial: "completed"` on its single action; the resolver advances to **Companion Chat**. It is cosmetic in v1 — no billing — and stays its own gate because the entitlement re-checks on expiry.
- The **Sibling Client Invitation** writes `siblingInvitation: "skipped"` on "Not now"; a real `completed` is server-observed (the Mac registers via #27, surfaced by `GET /me` #26), never claimed by the phone. The resolver treats `skipped` and `completed` alike — both advance to **Companion Chat**.
- The **Auth Adapter** selects an **Auth Provider**; only the **Neon Auth** provider yields a **User JWT**. Verifying that **User JWT** is the Control Plane's job (#23), not the Mobile Client's.
- **Telemetry** reports Mobile Client runtime/auth failures through an injected provider seam. It is additive to user-visible error state and never stores or sends **Conversation History** as telemetry context.
- Two tokens, two hops: the **Runtime Adapter** uses `AuthAdapter.getUserJwt()` (the **User JWT**) to authorize the `GET /agent` HTTP call, then puts the **`runtime_jwt`** that call returns on the WebSocket `connect.auth_token`, treating it as an opaque ticket. `runtime_jwt` is the same Neon Auth token passed through (monorepo ADR-0002); the Runtime Adapter does not assume that and never reuses `getUserJwt()` for the socket.
- The **Runtime Adapter** obtains **Routing** (`{ ws_url, runtime_jwt, agent_instance_id }`) from the Control Plane `GET /agent`, then connects the WebSocket directly to the **Agent Runtime**; the Control Plane is off the message path after that. It maps routing failures: `503` → retry `GET /agent` with capped backoff, `401` → re-authenticate, `403` → re-check `GET /me` for the next **Pre-Chat Gate** before retrying.
- The first opening is authored by the **Agent Runtime** (Conversation Start Trigger), never by the client. "No duplicate openings" is a **free consequence** of server-side session-start idempotency plus **Message Store** dedupe by `message_id` — there is deliberately **no** bespoke first-opening tracking on the client.
- The **Protected Opening** renders inside ordinary **Companion Chat**. The Composer accepts draft text while it is arriving, but early send attempts do not auto-send later; retrying an opening failure retries the Companion-authored opening only and leaves the user's draft untouched.
- The **Account Affordance** is the quiet utility entry point from **Companion Chat**, not a peer destination; the **Account Surface** owns the actual account and setup UI.
- The **Account Surface** can help a user manually set up the **Desktop Client** after a skipped **Sibling Client Invitation**, but it does not revive that skipped gate or claim a Mac is connected from Mobile-only state.
- Companion Chat may show a small, nonblocking Mac setup banner when Control Plane **Account State** reports no registered Desktop Client (`has_desktop_client: false`). This is product adoption chrome near the **Account Affordance**, not a **Pre-Chat Gate**, warning, or claim that the Companion has Mac context.
- The **Account Surface** is opened as a temporary utility sheet over **Companion Chat**, not as a peer route. Add a route only if native sheet presentation requires it, not because account is becoming a destination.
- Logout starts in the **Account Surface**, calls the **Auth Adapter**'s `signOut()`, then marks **Launch State** signed out so the **Launch State Resolver** returns the signed-out path. The Account Surface never navigates to the Identity Gate directly.
- Visible **Companion Chat** UI uses **Companion** language, not assistant, bot, or agent labels.
- The **Runtime Adapter** reconciles each outbound `user_message` to its server-truth copy by `message_id` to drive **Delivery Status**; the same dedupe collapses any duplicated inbound message (including a re-triggered opening).

## Flagged ambiguities

- **Consent Primer** was originally defined as a memory/relationship trust explainer ("How Intentive remembers"). Resolved 2026-07-02: that framing was wrong — it is the **Data & Privacy** acceptance (what data is collected/processed + Privacy Policy & Terms of Service). Memory/relationship explanation moves in-chat (ADR-0006 as superseded). Resolved 2026-07-02 (copy): the screen now uses Intentive-accurate disclosure and links to `heyintentive.com/privacy` and `/terms`; publishing the full legal pages on the marketing site remains a pre-ship dependency ([`docs/BACKLOGS.md`](docs/BACKLOGS.md)).
