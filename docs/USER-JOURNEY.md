# User Journey Map

How Intentive's four deployables and shared packages connect to the journeys users actually take. For vocabulary, see [`CONTEXT-MAP.md`](../CONTEXT-MAP.md). For deployment topology, see [`PRODUCTION.md`](PRODUCTION.md). For layer rules and invariants, see [`ARCHITECTURE.md`](../ARCHITECTURE.md).

## Deployables at a glance

| Deployable         | Path                      | What the user experiences                                                         | Where it runs                       |
| ------------------ | ------------------------- | --------------------------------------------------------------------------------- | ----------------------------------- |
| **Mobile Client**  | `apps/mobile/`            | Sign-in, Pre-Chat Gates, **Companion Chat**, push notifications, Account Surface  | iOS (Expo) → TestFlight / App Store |
| **Desktop Client** | `apps/desktop/`           | Desktop Coaching Window, required local perception, text-only Floating Bar, PMB effects | macOS SwiftPM → signed Founder Preview app |
| **Control Plane**  | `services/control-plane/` | Invisible authority: identity, gate state, device registry, Routing, push fan-out | Cloud Run (`us-west1`)              |
| **Agent Runtime**  | `services/agent-runtime/` | The **Companion**: chat, memory, proactive follow-ups, context from Mac           | GCE VM (`runtime.heyintentive.com`) |

**Shared contracts** (`packages/`): `protocol/` (WebSocket), `api-contract/` (Control Plane HTTP), `domain-types/`, `boundary/`, `providers/` (auth, telemetry). Clients never import server source; servers never redefine wire shapes locally.

```text
                         ┌─────────────────────────────────┐
                         │         Neon Postgres           │
                         │  control_plane.*  agent_runtime.* │
                         └──────────┬──────────────┬───────┘
                                    │              │
              ┌─────────────────────▼──┐    ┌──────▼──────────────────┐
              │     Control Plane      │    │     Agent Runtime       │
              │  identity · gates ·      │    │  gateway · sessions ·   │
              │  devices · routing ·     │◄──►│  conversation · cron ·  │
              │  notifications           │    │  heartbeat · delivery   │
              └──────────┬───────────────┘    └──────────┬──────────────┘
                         │  GET /me, /agent               │  WSS /ws
                         │  POST /consent, /devices       │  Protocol events
              ┌──────────┴──────────────┬─────────────────┴──────────┐
              │                         │                            │
        ┌─────▼─────┐            ┌──────▼──────┐              (future)
        │  Mobile   │            │   Desktop   │              Android
        │  (dormant │            │  (coaching) │
        │  in v1)   │            │             │
        └───────────┘            └─────────────┘
```

**Data-path rule:** Control Plane issues **Routing** once (`GET /agent` → `ws_url` + `runtime_jwt`) and steps out. All in-session traffic is Client ↔ Agent Runtime over WebSocket **Protocol**. Control Plane never proxies messages.

---

## Journey index

| #   | Journey                                                                           | Primary deployables                   |
| --- | --------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | [Cold launch → first chat (Mobile)](#1-cold-launch-first-chat-mobile)             | Mobile, Control Plane, Agent Runtime  |
| 2   | [Returning Mobile user](#2-returning-mobile-user)                                 | Mobile, Control Plane, Agent Runtime  |
| 3   | [Cold launch → Coaching Window (Desktop)](#3-cold-launch-coaching-window-desktop) | Desktop, Control Plane, Agent Runtime |
| 4   | [Cross-client: iPhone first, Mac second](#4-cross-client-iphone-first-mac-second) | All four                              |
| 5   | [Send a coaching message](#5-send-a-coaching-message)                             | Desktop, Agent Runtime                |
| 6   | [Coaching Perception reaches the Companion](#6-coaching-perception-reaches-the-companion) | Desktop, Agent Runtime          |
| 7   | [Least Necessary Intervention](#7-least-necessary-intervention)                   | Desktop, Agent Runtime                |
| 8   | [Account recovery & sibling setup](#8-account-recovery-sibling-setup)             | Mobile, Control Plane                 |

---

## 1. Cold launch → first chat (Mobile)

**User story:** Opens Intentive for the first time, sees Get Started, signs in with Google, accepts Data & Privacy, completes the onboarding funnel (name, acquisition source, notification permission), optionally skips Mac setup, accepts the free-trial offer, enters Companion Chat, receives the runtime-generated opening message.

### Flow

```mermaid
sequenceDiagram
  participant U as User
  participant M as Mobile Client
  participant CP as Control Plane
  participant RT as Agent Runtime

  U->>M: Launch app
  M->>CP: GET /me (no JWT)
  CP-->>M: 401 → Get Started + Identity Gate
  U->>M: Get Started → Google sign-in (Neon Auth)
  M->>CP: GET /me (JWT)
  CP-->>M: next_gate: consent_primer
  U->>M: Consent Primer (Data & Privacy) → Agree & Continue
  M->>CP: POST /consent
  M->>CP: GET /me
  CP-->>M: next_gate: sibling_client_invitation
  Note over M: Onboarding funnel (client-resolved until CP contract extends)
  U->>M: Name → Acquisition source → Grant Permissions (OS prompt)
  U->>M: Skip Mac setup (or view guidance)
  M->>CP: POST /sibling-invitation/skip
  M->>CP: GET /me
  CP-->>M: next_gate: null
  Note over M: Free Trial gate (client-resolved until CP entitlement lands)
  U->>M: Free Trial → Continue
  U->>M: Enter chat (first time)
  M->>CP: POST /devices/register (expo_push_token)
  M->>CP: GET /agent
  CP->>RT: POST /internal/sessions/start
  RT-->>CP: agent_instance_id, ws_url
  CP-->>M: ws_url, runtime_jwt, agent_instance_id
  M->>RT: WSS connect + Protocol handshake
  RT-->>M: hello_ok (reconnect snapshot)
  U->>M: Sends the first message
  M->>RT: user_message
  RT-->>M: companion_message (Interactive Turn reply)
```

### Gate sequence

**Mobile Launch State Resolver** (client-owned ordering; see `apps/mobile/docs/adr/0019-*`):

`SIGNED_OUT` → `MISSING_CONSENT` → `MISSING_ONBOARDING` → `SIBLING_INVITATION_PENDING` → `MISSING_TRIAL` → `READY_FOR_CHAT`

**Control Plane `next_gate`** (cross-client durable gates in `services/control-plane/src/domains/gates/service/compute-next-gate.ts`):

1. **Identity Gate** — satisfied by JWT on `GET /me` (not returned as `next_gate`)
2. **Consent Primer** — `POST /consent` (cross-client)
3. **Sibling Client Invitation** — `POST /sibling-invitation/skip` or observed Desktop device (cross-client)
4. **Capture Permission Setup** — Desktop only; Mobile never sees it

**Onboarding** (name → acquisition source → grant permissions) and **Free Trial** are client-resolved Pre-Chat Gates today. The Mobile mapper marks both `completed` for every real `GET /me` response until `packages/api-contract` and Control Plane gate sequencing extend; stub `LaunchStateSource` dev scenarios exercise the screens locally.

### Code map

| Step                    | Mobile Client                                                                                                                    | Control Plane                                                                         | Agent Runtime                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Launch routing          | `app/_layout.tsx` → `resolveLaunchState` (`src/domains/onboarding/service/resolve-launch-state.ts`) → `route-for-destination.ts` | —                                                                                     | —                                                                                |
| Account / gate read     | `createControlPlaneLaunchStateSource` (`src/providers/launch-state/`) maps `GET /me` → `LaunchState`                             | `identity/ui/get-me.ts` → `resolveAccount` composes `next_gate`, `has_desktop_client` | —                                                                                |
| Get Started             | `src/domains/auth/ui/get-started.tsx` (first view inside `/(gates)/identity`; not a gate)                                        | —                                                                                     | —                                                                                |
| Identity Gate           | `src/domains/auth/ui/` + Neon Auth via `Auth Adapter`                                                                            | JWT verify: `src/http/auth.ts` + `packages/providers/` JWKS                           | —                                                                                |
| Consent Primer          | `app/(gates)/consent.tsx` → `onboarding/ui/consent-primer.tsx` (Data & Privacy)                                                  | `gates/ui/post-consent.ts` → `control_plane.user_gates`                               | —                                                                                |
| Onboarding funnel       | `app/(onboarding)/index.tsx` → `onboarding/ui/onboarding-funnel.tsx` (name → source → grant permissions)                         | — (client-resolved until CP contract extends)                                         | —                                                                                |
| Sibling invitation      | `app/(gates)/invite.tsx`                                                                                                         | `gates/ui/post-sibling-invitation-skip.ts`                                            | —                                                                                |
| Free Trial              | `app/(gates)/trial.tsx` → `onboarding/ui/free-trial.tsx`                                                                         | — (client-resolved until CP entitlement lands)                                        | —                                                                                |
| Notification permission | `onboarding/ui/grant-permissions.tsx` (injected ask via `(onboarding)` route)                                                    | —                                                                                     | —                                                                                |
| Device + push token     | `notifications/` → `POST /devices/register` (around first chat entry; no re-prompt once decided)                                 | `devices/ui/post-device-register.ts` → `control_plane.devices`                        | —                                                                                |
| Routing                 | `chat/service/routing-client.ts` → `GET /agent`                                                                                  | `routing/ui/get-agent.ts` → `agents.ensureAgentInstance` → Session Start              | `internal/` receives `POST /internal/sessions/start`                             |
| Chat surface            | `src/entrypoints/chat-entry.tsx` → `CompanionChat` + Runtime Adapter                                                             | —                                                                                     | `gateway/` handshake, `sessions/` per-user queue                                 |
| Opening message         | Runtime Adapter merges `hello_ok` snapshot; first message is user-authored                                                       | —                                                                                     | Session Start is model-free; the first `user_message` starts an Interactive Turn |

**Wire contracts:** `packages/api-contract/` (`GetMeResponse`, `PostConsentRequest`, `GetAgentResponse`); `packages/protocol/` (`connect`, `hello_ok`, `companion_message`, `user_message`).

---

## 2. Returning Mobile user

**User story:** Reopens app; lands directly in chat if gates are clear; timeline survives reinstall because history is server-truth.

### Flow

```text
Launch → GET /me → next_gate: null → route to (chat)/
       → GET /agent → WSS reconnect
       → hello_ok snapshot hydrates Message Store
       → live companion_message / presence_update append
```

### Code map

| Concern           | Mobile Client                                                                                                           | Control Plane                                                                              | Agent Runtime                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Skip gates        | `resolveLaunchState` → `READY_FOR_CHAT` when consent + onboarding + sibling + trial are satisfied                       | `computeNextGate` → `null` (shared gates only; onboarding/trial are client-resolved today) | —                                                                |
| History hydration | `runtime/runtime-adapter.ts` + `service/conversation-reducer.ts` + `service/message-store.ts` (in-memory only; no disk) | —                                                                                          | `conversation/` + `hello_ok` / `session_snapshot` in `protocol/` |
| Reconnect         | Runtime Adapter: generation tokens, queue until `hello_ok`, merge backfill                                              | —                                                                                          | `gateway/runtime/connection-registry.ts`, `sessions/` ordering   |
| Agent State UI    | `service/chat-presentation.ts` (`Available` / `Thinking` / `Following up` / `Paused`)                                   | —                                                                                          | `via_post_message_back` flag on messages                         |

---

## 3. Cold launch → Coaching Window (Desktop)

**User story:** Installs the Desktop Client, signs in, completes every onboarding
step and required local grant, then receives one Opening Orientation while
screen, microphone, and system-audio perception run only inside the Desktop
Coaching Window.

### Flow

```mermaid
sequenceDiagram
  participant U as User
  participant D as Desktop Client
  participant CP as Control Plane
  participant SM as Screen Memory
  participant CC as Desktop Context Compiler
  participant RT as Agent Runtime

  U->>D: Launch (menu bar)
  D->>CP: GET /me (JWT, X-Client-Kind: desktop, X-Capture-Permission-Granted)
  alt not signed in
    CP-->>D: 401 → Settings sign-in (Neon Auth)
  else gates remain
    CP-->>D: next_gate (consent / sibling / capture_permission_setup)
    U->>D: Complete gates + Capture Permission Setup wizard
  end
  D->>D: Require live Screen Recording, Microphone, Accessibility, and System Audio grants
  D->>CP: GET /agent
  CP->>RT: POST /internal/sessions/start
  D->>RT: WSS connect (desktop_coaching_v1 capability)
  D->>RT: coaching_window_started
  D->>RT: coaching_window_presence (active)
  RT-->>D: companion_message (one Opening Orientation, window_id)
  Note over RT: If bootstrap is unfinished, include BOOTSTRAP and mark it in progress
  loop Context-change gated cadence
    D->>SM: Write local screen record
    SM->>CC: OCR + metadata
    CC->>CC: Compact + redact + label sensitivity
    CC->>RT: perception_event (window_id, Protocol)
  end
  U->>D: Send text from the Floating Bar
  D->>RT: user_message (window_id)
  Note over RT: Matching active-window bootstrap response atomically marks it complete
  U->>D: Pause Coaching
  D->>D: Stop screen + microphone + system audio synchronously
  D->>RT: coaching_window_ended (pause)
```

### Gate sequence (Desktop)

Same Control Plane sequencer; Desktop additionally requires **Capture Permission Setup** until `X-Capture-Permission-Granted: true` on `GET /me`. Live readiness is enforced locally in the SwiftPM app; Control Plane remains the coarser policy nudge.

### Code map

| Step              | Desktop Client                                | Control Plane                                | Agent Runtime                                                   |
| ----------------- | --------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| Sign-in UI        | Auth Adapter + hosted/dev provider            | —                                            | —                                                               |
| Permission wizard | Capture Permission Setup                      | `GET /me` with device signal headers         | —                                                               |
| Gate reads        | Control Plane client after login              | Same `identity` + `gates` composer as Mobile | —                                                               |
| Routing + WSS     | Runtime Bridge                                | `GET /agent`                                 | `gateway/`                                                      |
| Coaching lifecycle | Desktop Coaching Window coordinator          | —                                            | `coaching_windows` projection                                   |
| Local persistence | Screen Memory                                 | —                                            | —                                                               |
| Context delivery  | Desktop Context Compiler → window-scoped `perception_event` | —                                  | metadata ledger → `perception_records` → recent perception/tool |
| Text conversation | Floating Bar → `user_message`                 | —                                            | Conversation History + Interactive Turn                         |
| Effect Runner     | Floating Bar + edge glow on PMB               | —                                            | Post-Message-Back delivery                                      |
| Pause/Resume      | Read-only transcript + one Resume action      | —                                            | Window end/new start; pending proactivity invalidated            |

**Desktop joins the one conversation.** Text-only Floating Bar chat sends
`user_message`; screen and passive-audio summaries send window-scoped
`perception_event` records and stay out of Conversation History. Raw media
remains local. Lock pauses perception while preserving the window; sleep ends it.

---

## 4. Cross-client: iPhone first, Mac second

**User story:** Onboards on iPhone, chats with Companion, later installs Mac app — Mac skips Identity and Consent, must complete Capture Permission Setup locally, then feeds context into the same Agent Instance.

### What transfers vs what doesn't

| State                    | Cross-client?         | Mechanism                                                                   |
| ------------------------ | --------------------- | --------------------------------------------------------------------------- |
| Identity (sign-in)       | Yes                   | Neon Auth JWT; same `user_id`                                               |
| Consent Primer           | Yes                   | `control_plane.user_gates` via `POST /consent`                              |
| Sibling invitation       | Yes                   | Skip record **or** observed Desktop in Device Registry clears Mobile prompt |
| Capture permission       | **No** (device-local) | Mac wizard + live grant probes; `capture_permission_setup` gate             |
| Conversation History     | Yes                   | One **Agent Instance** per User in Runtime                                  |
| Screen Memory perception | N/A on phone          | Desktop-only production via `perception_event`                              |

### Code map

| Concern                         | Where it lives                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `has_desktop_client` on account | Control Plane `identity.resolveAccount` reads `devices.listDevicesForUser`                   |
| Sibling gate auto-clear         | `computeNextGate`: `hasSiblingDevice` from device registry                                   |
| Mac setup banner in chat        | Mobile `chat/service/chat-presentation.ts` reads projected `AccountState.has_desktop_client` |
| Same Companion                  | Both clients: same `user_id` → same `agent_instance_id` via `GET /agent` / Session Start     |

---

## 5. Send a coaching message

**User story:** Types in the Floating Bar during an active Coaching Window and
receives an ordinary reply in the same Runtime-owned Conversation History.

### Flow

```text
User types in Floating Bar → Runtime Bridge sends user_message
           → Agent Runtime: gateway → sessions (per-user queue) → runtime (Interactive Turn)
           → DeepAgents turn → companion_message chunks → delivery port (live stream)
           → Desktop conversation projection merges the persisted stream
```

### Code map

| Layer           | Path                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| Composer UI     | Desktop Floating Bar                                                                    |
| Protocol client | Desktop Runtime Bridge                                                                  |
| Wire schema     | `packages/protocol/` (`user_message`, `companion_message`, `delivery_ack`)               |
| Ingress         | `services/agent-runtime/src/domains/gateway/`                                            |
| Ordering        | `services/agent-runtime/src/domains/sessions/` (transactional ingress, idempotency keys) |
| Brain           | `services/agent-runtime/src/domains/runtime/service/turn-runner.ts` → DeepAgents adapter |
| History         | `services/agent-runtime/src/domains/conversation/` (Neon `conversation_messages`)        |
| Live delivery   | `services/agent-runtime/src/domains/delivery/service/delivery-port.ts`                   |

**Not in path:** Control Plane (no message proxy).

---

## 6. Coaching Perception reaches the Companion

**User story:** While the Coaching Window is active, the Companion receives a
bounded chronological progression of privacy-filtered work evidence. Pause,
lock, disconnect, and end fail closed for proactive coaching.

### Flow

```text
Desktop Capture Layer → Screen Memory insert (local truth)
                      → Desktop Context Compiler
                      → perception_event(window_id) on WSS
                      → metadata-only Runtime ledger + perception_records
                      → privacy-safe recent progression / search_screen_context
                      → optional Monitoring Turn (silent unless Post-Message-Back)
```

`session_end_marker` remains capture/archive durability. Coaching presence comes
only from explicit window lifecycle plus live connection-scoped presence.

### Code map

| Step                | Desktop                  | Agent Runtime                                                                                           |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Local record        | Screen Memory            | —                                                                                                       |
| Compile             | Desktop Context Compiler | —                                                                                                       |
| Protocol emit       | Runtime Bridge           | `gateway/` → `sessions/`                                                                                |
| Persist event       | —                        | `runtime_events` ledger + `perception_records`                                                          |
| Recent context read | —                        | window-scoped privacy-safe reader over ledger ordering + current projection                            |
| Search older screen | —                        | `perception/service/search-screen-context.ts`                                                           |
| Agent use           | —                        | `runtime/service/monitoring-turn.ts`, `bundles/service/assemble-system-prompt.ts` (`RECENT_PERCEPTION`) |

---

## 7. Least Necessary Intervention

**User story:** While an active Coaching Window has a matching live Desktop
presence, a Monitoring Turn may decide that one brief intervention would help.
The Floating Bar appears without stealing focus. Outside that boundary, nothing
proactively reaches the User.

### Flow

```mermaid
sequenceDiagram
  participant RT as Agent Runtime
  participant D as Desktop Client

  D->>RT: active window + live presence + window-scoped perception
  Note over RT: perception trigger or 120-second active-window floor
  RT->>RT: Collapse to one Monitoring Turn over new evidence
  RT->>RT: Companion stays silent or chooses Post-Message-Back
  RT->>RT: Persist conversation_messages (via_post_message_back=true)
  alt same window still active and attested
    RT->>D: companion_message (window_id)
    D->>D: Matching-window guard → Floating Bar + edge glow
  else locked, paused, ended, or disconnected
    RT->>RT: Suppress proactive presentation
  end
```

### Invariants

- Perception is the primary clock; the active-window floor targets a judgment
  opportunity within 120 seconds.
- The Companion remains silent by default and owns intervention judgment.
- Coaching Post-Message-Back streams only to the matching Desktop window. It
  never falls back to Mobile, Control Plane push, or a macOS notification.
- Ordinary interactive routing remains separate and unchanged.

### Code map

| Concern                   | Agent Runtime                                      | Desktop Client                                      |
| ------------------------- | -------------------------------------------------- | --------------------------------------------------- |
| Window gate               | `coaching_windows` + live connection attestation   | `DesktopCoachingWindowCoordinator`                  |
| Cadence                   | 120-second Monitoring coordinator                  | Existing smart local capture cadence                |
| Judgment                  | Monitoring Turn + coaching Procedure Floor         | Evidence only; no drift classifier                  |
| Post-Message-Back         | Persist, revalidate matching window, stream        | Match `window_id`, then Floating Bar + edge glow     |
| Failure behavior          | No push; history/reconnect remains server truth    | Lock/Pause/end/disconnect suppress visual effect    |

---

## 8. Account recovery & sibling setup

**User story:** Opens Account Surface from chat affordance; sees identity, connection mood, Mac setup status; can sign out or revisit Mac guidance without re-blocking gates.

### Code map

| Surface                     | Mobile                                                       | Control Plane             |
| --------------------------- | ------------------------------------------------------------ | ------------------------- |
| Account sheet               | `src/domains/account/ui/account-surface.tsx`                 | —                         |
| State source                | `src/providers/account-state/` → `GET /me` projection        | `identity.resolveAccount` |
| Connection status           | `account/service/account-status.ts` (Routing + runtime mood) | —                         |
| Sign out                    | `Auth Adapter.signOut` + `markSignedOut()` on Launch State   | —                         |
| Mac guidance (non-blocking) | `chat-presentation.ts` banner when `!has_desktop_client`     | Device registry           |

Desktop UI shows coarse connection state only; JWT and `ws_url` stay inside the Runtime Bridge seam.

---

## Domain quick reference

Business domains per deployable (each follows `types → config → repo → service → runtime → ui`):

| Deployable    | Domains                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Mobile        | `auth`, `onboarding`, `chat`, `notifications`, `account`                                                                       |
| Desktop       | Runtime Bridge, Screen Memory, Desktop Context Compiler, Floating Bar, Passive Audio, Effect Runner, Auth, Control Plane client |
| Control Plane | `identity`, `devices`, `gates`, `agents`, `routing`, `notifications`                                                           |
| Agent Runtime | `gateway`, `sessions`, `conversation`, `protocol`, `runtime`, `delivery`, `cron`, `heartbeat`, `memory`, `bundles`, `internal` |

---

## HTTP & Protocol cheat sheet

### Control Plane (public, JWT)

| Endpoint                        | Purpose                                               | Schema                            |
| ------------------------------- | ----------------------------------------------------- | --------------------------------- |
| `GET /me`                       | Account state + next Pre-Chat Gate                    | `packages/api-contract/public.ts` |
| `GET /agent`                    | Routing: `ws_url`, `runtime_jwt`, `agent_instance_id` | same                              |
| `POST /consent`                 | Record Consent Primer completion                      | same                              |
| `POST /sibling-invitation/skip` | Skip Mac setup prompt                                 | same                              |
| `POST /devices/register`        | Device fingerprint + Expo push token                  | same                              |

### Internal API (shared-secret)

| Direction     | Endpoint                                      | Purpose                               |
| ------------- | --------------------------------------------- | ------------------------------------- |
| CP → Runtime  | `POST /internal/sessions/start`               | Idempotent Agent Instance create/load |
| Runtime → CP  | `POST /internal/notifications/push`           | Post-Message-Back push handoff        |
| Operator → CP | `POST /internal/notifications/check-receipts` | Expo receipt maintenance              |

### Protocol (WSS, Neon Auth JWT on `connect`)

| Client → Runtime                                                                 | Runtime → Client                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------- |
| `connect` (+ `client_kind`, optional `client_tz`, optional `capabilities`)        | `hello_ok` (reconnect snapshot)                |
| `coaching_window_started`, `coaching_window_ended`, `coaching_window_presence`   | `companion_message` (+ optional `window_id`)   |
| `perception_event` (optional `window_id` for queued legacy-event compatibility) | `runtime_ingress_ack`                          |
| `perception_tombstone`, `session_end_marker`                                     | `session_snapshot`, `history_backfill_response` |
| `user_message`, `presence_update`, `delivery_ack`, `history_backfill_request`    | `runtime_error`                                |

Full schemas: `packages/protocol/src/index.ts`.

---

## Related docs

| Topic                   | Document                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product vocabulary      | [`CONTEXT-MAP.md`](../CONTEXT-MAP.md)                                                                                                                                   |
| Mobile structure        | [`apps/mobile/ARCHITECTURE.md`](../apps/mobile/ARCHITECTURE.md)                                                                                                         |
| Desktop structure       | [`apps/desktop/ARCHITECTURE.md`](../apps/desktop/ARCHITECTURE.md)                                                                                                       |
| Control Plane structure | [`services/control-plane/ARCHITECTURE.md`](../services/control-plane/ARCHITECTURE.md)                                                                                   |
| Agent Runtime structure | [`services/agent-runtime/ARCHITECTURE.md`](../services/agent-runtime/ARCHITECTURE.md)                                                                                   |
| Wire contracts          | [`packages/api-contract/ARCHITECTURE.md`](../packages/api-contract/ARCHITECTURE.md), [`packages/CONTEXT.md`](../packages/CONTEXT.md)                                    |
| Production deploy       | [`PRODUCTION.md`](PRODUCTION.md)                                                                                                                                        |
| PRDs                    | [`docs/prd/mobile-PRD.md`](prd/mobile-PRD.md), [`docs/prd/control-plane-PRD.md`](prd/control-plane-PRD.md), [`docs/prd/agent-runtime-PRD.md`](prd/agent-runtime-PRD.md) |
