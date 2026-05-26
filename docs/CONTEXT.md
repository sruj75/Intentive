# Intentive

Intentive is one product spanning a mobile client, a desktop client, a server-side control plane, and a multi-tenant agent runtime. A user signs in once on either client, completes onboarding once, and connects every client surface to the same agent. This document is the single source of truth for vocabulary across all four deployables.

## Language

**Intentive**:
The whole product system — Mobile Client, Desktop Client, Control Plane, Agent Runtime, and the durable state they share.
_Avoid_: macOS app, mobile app, the agent, the backend

**Companion**:
The product-facing concept of the proactive agent the user talks to. What the user thinks they are interacting with.
_Avoid_: Execution Companion, chatbot, assistant, agent (as a noun for the product), bot

**Agent Runtime**:
The deployed, always-alive, multi-tenant service that runs Companion behavior for every user. Lives at `services/agent-runtime/`. Hosts long-running runtime state, agent loops, cron, and heartbeats — must stay resident, which is why it deploys to a GCE VM rather than to a stateless platform.
_Avoid_: Deep Agent (the service), OpenClaw Agent, v1-deepagent, per-user VM, serverless runtime

**Multi-Tenant**:
Shared compute, per-user isolation. One Agent Runtime process serves many users; each user has their own logical **Agent Instance** scoped by `user_id` alone. There is no second-level grouping (no org, team, workspace, or `tenant_id`) in v1 — the User is the tenant.
_Avoid_: tenant_id, per-tenant schema, B2B isolation, per-user VM

**Agent Instance**:
The per-user logical record (id, config, conversation handle, status) inside the Agent Runtime. Created synchronously on first chat entry. Not a process, not a VM, not a container — a row.
_Avoid_: per-user VM, runtime process, container

**DeepAgents**:
The LangChain TypeScript library (`langchain-ai/deepagentsjs`) the Agent Runtime is built on. Reference only — never a name for our service or product.
_Avoid_: Deep Agent, the runtime, the agent

**Mobile Client**:
The iOS Expo application at `apps/mobile/`.
_Avoid_: Expo, mobile surface, the mobile app

**Desktop Client**:
The macOS Tauri application at `apps/desktop/`. **Capture-only in v1** — runs ScreenPipe, produces Context Snapshots, manages capture state from the menu bar, and exposes Account/Settings via Neon Auth UI. **No chat UI in v1.** All conversation lives on the Mobile Client (and future Android Client).
_Avoid_: Tauri, the desktop app, OpenClaw client, desktop chat surface

**Control Plane**:
The server-side authority at `services/control-plane/`. Owns identity, device registry, agent instance registry, pre-chat gate state, and routing. Sits **beside** the client↔runtime data path, never **on** it.
_Avoid_: backend, mobile backend, desktop backend, API, proxy, gateway

**Routing**:
The Control Plane's job of telling each signed-in client *where* the Agent Runtime is and *who* the client is (URL + JWT). Routing happens **once, before** the data connection opens. The Control Plane is not in the path of any subsequent message.
_Avoid_: proxying, forwarding, gatewaying

**Protocol**:
The shared WebSocket message contract every client speaks and the Agent Runtime understands. Defined once in `packages/protocol/` (Zod schemas). Imported by Mobile Client, Desktop Client, future Android Client, and Agent Runtime. **This is where client unification lives** — not in network topology.
_Avoid_: client SDK, wire format, message format (those are implementation details under Protocol)

**Context Snapshot**:
A time-bounded, on-device-summarized record of what the user was doing during a 10-minute window. Produced by the Desktop Client. Delivered to the Agent Runtime as a `context_snapshot` event on the same WebSocket every client uses.
_Avoid_: webhook payload, HTTP POST body, activity dump

**Session End Marker**:
A `session_end_marker` event the Desktop Client sends when a Capture Session ends (user toggle, quit, or crash). Distinct event type from `context_snapshot`.
_Avoid_: final snapshot, end flag

**Internal API**:
The private HTTP surface the **Agent Runtime** exposes for server-to-server calls from the **Control Plane**. Bound only to a private network interface; protected by a shared secret in `Authorization: Bearer`. Not reachable from clients or the public internet.
_Avoid_: admin API, public API, management API

**Session Start**:
The single, synchronous, idempotent internal call from Control Plane → Agent Runtime when a user first enters chat. One call (`POST /internal/sessions/start`) creates the **Agent Instance** if missing and fires the **Conversation Start Trigger**, returning routing info (`agent_instance_id`, `ws_url`).
_Avoid_: Agent Instance Creation + Conversation Start Trigger as separate calls, async provisioning

**Conversation Start Trigger**:
The one-time, idempotent-per-User signal that tells the Agent Runtime to begin the first conversation. Fires as part of **Session Start**, not as a separate call.
_Avoid_: standalone endpoint, client-issued trigger, repeated triggers across reconnects

**Conversation History**:
The complete record of messages between a User and their Companion. Owned exclusively by the **Agent Runtime** in its Neon schema. The Mobile Client does not persist messages locally — it reads the authoritative timeline from the WebSocket reconnect snapshot on every cold open.
_Avoid_: on-device chat store, local conversation cache, two-sided sync, mock messages in the app

**Snapshot Store**:
The Desktop Client's local SQLite record of every Context Snapshot it produced and sent. **Local-truth, not a cache** — the snapshot originates on-device and the local copy is the audit trail. Different role from chat history; do not generalize the two.
_Avoid_: cache, mirror of server state, optional store

**Post-Message-Back**:
The Agent Runtime's primitive for **deliberately** interrupting a user with a message. Distinct from a regular reply. Invoked when the agent has decided "this is worth a push notification." The Runtime delivers the message into the **Conversation History** *and* — if the user is not connected — calls Control Plane's `POST /internal/notifications/push` to fire an APNs push. Every push notification in V1 originates from a Post-Message-Back; regular replies do not push.
_Avoid_: auto-notify on reply, "agent replied while you were away" push, background sync

**Cron**:
The Agent Runtime's scheduled-trigger primitive. Allows the agent to decide on its own time ("ping the user at 9am tomorrow about the deadline"). A Cron firing may or may not result in **Post-Message-Back** — the agent decides whether the trigger is worth interrupting for.
_Avoid_: scheduled notification, background reminder

**Heartbeat**:
The Agent Runtime's interval-trigger primitive (e.g., "every N minutes while a Capture Session is active, evaluate state"). Distinct from Cron because it is periodic and tied to liveness rather than absolute time. Like Cron, a Heartbeat tick may or may not produce a **Post-Message-Back**.
_Avoid_: keep-alive ping, presence beacon (those are transport-layer concerns)

**Push Notification**:
An APNs (or later FCM) push delivered to a User's device(s). Always originates from **Post-Message-Back**. The Agent Runtime does not call APNs directly — it asks the Control Plane, which owns device tokens and Apple credentials.
_Avoid_: in-app banner, toast, transport ping

**Pre-Chat Gate**:
A client-visible step the Control Plane requires (or offers) before a User enters chat. Gates fall into two kinds:
- **Cross-Client Gate** — once completed on any device, the Control Plane records it and no other client of the same User re-prompts. Examples: **Identity Gate**, **Consent Primer**, **Sibling Client Invitation** (skip).
- **Device-Local Gate** — must be completed on the specific device that requires it; cross-client completion does not satisfy it. Example: **Capture Permission Setup** (macOS Privacy Settings can only be granted on the Mac that records).

The Control Plane's `GET /me` returns the next gate for the calling client based on `client_kind` and cross-client state. One endpoint, one model, per-client gate sequence.
_Avoid_: per-screen onboarding flag, client-local gate state, separate endpoints per gate

**Identity Gate**:
The Google sign-in step (Apple sign-in later). **Cross-Client Gate**. Same Google account on phone and Mac resolves to the same User.

**Consent Primer**:
The one-time relationship-consent screen explaining memory, follow-ups, and user control. **Cross-Client Gate**. Asked once per User across all clients.

**Capture Permission Setup**:
The macOS Privacy Settings flow (Screen Recording, Microphone, Accessibility) required on the Mac before the Desktop Client can start a Capture Session. **Device-Local Gate**. Cannot be granted from the phone.

**Sibling Client Invitation**:
An optional client-offered prompt to install the other client (Mobile invites to install Desktop, and vice versa). **Cross-Client Gate** for *skip* state — skipping on either client records "skipped for now" and removes it from active gate flow on both. Re-offered later only when a contextual reason appears.

## Relationships

- **Intentive** is composed of one **Control Plane**, one **Agent Runtime**, and replaceable **Clients** — currently the **Mobile Client** and **Desktop Client**.
- The **Agent Runtime** is the deployed shape of the **Companion**. The **Companion** is what users perceive; the **Agent Runtime** is what runs.
- The **Agent Runtime** is built on **DeepAgents** but is not synonymous with it.
- The **Agent Runtime** is **Multi-Tenant**: one process, many users, per-user **Agent Instances**.
- A **User** has exactly one **Agent Instance** in v1.
- Every **Client** (Mobile, Desktop, future Android) connects **directly** to the **Agent Runtime** via WebSocket, using the URL and JWT issued by the **Control Plane**.
- The **Control Plane** never sees an in-session message. It issues **Routing** and then steps out of the data path.
- All **Clients** speak the same **Protocol** defined in `packages/protocol/`. The Agent Runtime distinguishes them only by the `client_kind` field on the `connect` handshake.
- The **Mobile Client** primarily sends `user_message` events. The **Desktop Client** primarily sends `context_snapshot` and `session_end_marker` events. Both share the same handshake, auth, idempotency, and reconnect semantics.
- **Session Start** is the only Control Plane → Agent Runtime call in v1. It is synchronous, idempotent per User, and bundles Agent Instance creation with the Conversation Start Trigger.
- The Agent Runtime's **Internal API** trusts the Control Plane via a shared secret on a private network interface. User JWT auth is separate and used only on the public WebSocket.
- **Conversation History** is server-truth. The Mobile Client renders the authoritative timeline streamed back on WebSocket reconnect; it stores nothing locally.
- The **Snapshot Store** on the Desktop Client is unrelated to chat history. It is local-truth for snapshots the device itself produced.
- **Push Notifications** in v1 originate exclusively from **Post-Message-Back**. Replies do not auto-push.
- **Post-Message-Back** is invoked by the Agent Runtime, which then calls Control Plane's `POST /internal/notifications/push`. The Control Plane owns APNs credentials and the device-token side of the Device Registry.
- **Cron** and **Heartbeat** are triggers, not notifications. A trigger fires → agent code runs → agent may or may not decide to **Post-Message-Back**.
- The Mobile Client requests notification permission **on first entry into chat**, framed around delivering Companion messages — not at app launch.
- The **Mobile Client** is the only client with a chat surface in v1. The **Desktop Client** has no chat UI; it sends Context Snapshots and shows capture state.
- **Pre-Chat Gates** are owned by the Control Plane. Mobile's v1 gate sequence: Identity Gate → Consent Primer → Sibling Client Invitation (skippable). Desktop's v1 gate sequence: Identity Gate → Consent Primer → Capture Permission Setup → Sibling Client Invitation (skippable). Identity Gate and Consent Primer states are shared across clients.

## Example dialogue

> **Dev:** "When a user signs in on the Mac after onboarding on iPhone, who decides whether to show onboarding?"
> **Domain expert:** "The Control Plane. The Mac calls `GET /me` and gets back the next **Pre-Chat Gate**. **Identity Gate** and **Consent Primer** are **Cross-Client Gates** — already done on iPhone, the Mac skips them. **Capture Permission Setup** is a **Device-Local Gate** — must happen on the Mac itself, even though the user is already 'onboarded'."

> **Dev:** "Where do chat messages live?"
> **Domain expert:** "**Conversation History** lives in the **Agent Runtime**'s Neon schema. The Mobile Client stores nothing — it renders the timeline the Runtime streams back on WebSocket reconnect. Delete the app, reinstall, sign back in, everything's there."

> **Dev:** "Does the Mac have a chat screen?"
> **Domain expert:** "No. Desktop is capture-only in v1. It runs ScreenPipe, produces **Context Snapshots**, sends them as `context_snapshot` events on the WebSocket, and shows capture state in the menu bar. Chat lives on Mobile."

> **Dev:** "If the Mac and the phone are both signed in, are there two agents?"
> **Domain expert:** "No. Agents are per-User. The User has one **Agent Instance**. The Mac and phone are two **Devices** that both connect to the same Agent Instance over the WebSocket."

> **Dev:** "Should the Control Plane forward the Mac's snapshots to the runtime?"
> **Domain expert:** "No. The Control Plane only issues **Routing**. It never sits on the data path. The Mac connects directly to the **Agent Runtime** over the WebSocket, same as the phone. Same **Protocol**, different events."

> **Dev:** "The user backgrounds the app. The agent generates a reply. Does the phone buzz?"
> **Domain expert:** "Depends. If the agent is just replying to something the user sent, no — it's not a **Post-Message-Back**, it just lands in the timeline. If the agent decides this reply is worth interrupting for and invokes **Post-Message-Back**, then yes — Runtime calls Control Plane's `POST /internal/notifications/push`, Control Plane fires the APNs push."

> **Dev:** "Cron fires at 9am. Does the user always get a notification?"
> **Domain expert:** "No. **Cron** is a trigger, not a notification. The cron fires, the agent code runs, and the agent decides whether to **Post-Message-Back**. The trigger and the notification are separate concerns."

> **Dev:** "We're adding Android. What server work do we need?"
> **Domain expert:** "Zero. Android imports `packages/protocol`, implements the WebSocket client, handshakes with `client_kind: 'android'`. Control Plane and Agent Runtime don't change — that's the whole point of the **Protocol** being the unification layer."

> **Dev:** "Where does `tenant_id` live in the schema?"
> **Domain expert:** "It doesn't. Intentive is direct-to-consumer. The User is the tenant. Everything is scoped by `user_id` alone."

> **Dev:** "Does the runtime call APNs directly?"
> **Domain expert:** "No. APNs credentials and device tokens live in the **Control Plane**'s Device Registry. The runtime invokes **Post-Message-Back**, which delivers into Conversation History and — if the user is offline — calls the Control Plane to send the push."

## Flagged ambiguities

- "Deep Agent" was used in three different senses (service, product concept, library). Resolved: **Agent Runtime** is the service, **Companion** is the product concept, **DeepAgents** is the library.
- "OpenClaw Agent" appeared in `apps/desktop/CONTEXT.md` as a name for the deployed service. Rejected: the Agent Runtime is inspired by OpenClaw patterns but explicitly is not OpenClaw (per `services/control-plane/CONTEXT.md`).
- "Execution Companion" appeared in `apps/mobile/CONTEXT.md`. Resolved: drop "Execution" — **Companion** alone is canonical and matches user-facing surfaces like "Companion Chat".
- "Per-user VM" / "OpenClaw VM" appeared in `apps/desktop/CONTEXT.md`. Rejected: OpenClaw's default is per-user VM; Intentive is **Multi-Tenant** shared compute. The Agent Runtime runs on its own GCE VM because it needs to stay alive for long-running state, agent loops, and cron/heartbeat — not because each user gets a VM.
- "`tenant_id`" appeared in `services/agent-runtime/CONTEXT.md` as part of `(tenant_id, user_id)` scoping. Rejected for v1: Intentive is direct-to-consumer with no org/team/workspace concept; the User is the tenant. Runtime state is scoped by `user_id` alone. If a second-level grouping ever appears, it will get a concrete name (e.g., `household_id`), not the generic `tenant_id`.
- "Tauri pushes snapshots via HTTPS webhook to a per-user GCP VM" appeared in `apps/desktop/CONTEXT.md`. Rejected: the Agent Runtime is **Multi-Tenant** (no per-user VM) and the client↔runtime path is the same WebSocket **Protocol** for every client. The Desktop Client sends `context_snapshot` events on that WebSocket.
- "Control Plane forwards client messages to the Agent Runtime" was proposed during grilling. Rejected on Ousterhout grounds: it leaks message-shape knowledge across three modules instead of one (`packages/protocol`), gives the Control Plane two responsibilities instead of one, and is a textbook temporal-decomposition anti-pattern. Client unification belongs in the **Protocol** layer, not the network topology.
- "On-device Conversation Store in the Mobile Client" appeared in `apps/mobile/CONTEXT.md`. Rejected for v1: that scaffolding existed only because the server wasn't built yet and the team wanted to validate chat UI in isolation. With the monorepo and the Agent Runtime in scope, the Mobile Client reads conversation history directly from the server's reconnect snapshot. No on-device message store, not even as a cache, until measured latency proves one is needed.
- "V1.5" as a separate milestone is rejected. Proactive Companion behavior (Cron, Heartbeat, Post-Message-Back, Follow-Up loops, memory) is in v1. There is one product version and one Runtime capability set. Anything that was previously "deferred to V1.5" in repo CONTEXTs is either in v1 or removed entirely.
- "Defer notification permission until Follow-Up exists" appeared in `apps/mobile/CONTEXT.md`. Rejected: with Post-Message-Back in v1, notifications are a v1 capability and the permission ask happens on first chat entry, framed around Companion message delivery.
- "GCP Provisioner" appeared in `apps/mobile/CONTEXT.md`, `apps/desktop/CONTEXT.md`, and `services/control-plane/CONTEXT.md` as a module that spins up per-user infrastructure. **Removed** from v1 vocabulary entirely. The Agent Runtime is one always-on GCE VM deployed by CI/CD, serving all users. There is no per-user provisioning step. If per-deployment infrastructure ever returns it will get a fresh, specific name.
- "Desktop Client has a chat UI / chat shell" was implied in some early Tauri DESIGN.md content. Rejected for v1: Desktop is capture-only. Chat lives on Mobile (and future Android). The Desktop's WebSocket connection sends `context_snapshot` + `session_end_marker` and receives delivery acks only.
