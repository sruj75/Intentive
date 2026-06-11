# Intentive — Context Map

Intentive is one product spanning a Mobile Client, a Desktop Client, a server-side Control Plane, and a multi-tenant Agent Runtime, plus the shared contracts they all import. This repo is **multi-context**: each deployable owns its own `CONTEXT.md` for the vocabulary specific to it. This map holds the product-wide shared language, the relationships that cross context boundaries, and a pointer to where each context lives.

## Contexts

| Context                  | Vocabulary                                                               | Structure                                                                          | Decisions (ADRs)                                                       |
| ------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Shared** (`packages/`) | [`packages/CONTEXT.md`](packages/CONTEXT.md)                             | [`ARCHITECTURE.md`](ARCHITECTURE.md) + `packages/*/ARCHITECTURE.md`                | system-wide → [`docs/adr/`](docs/adr/)                                 |
| **Mobile Client**        | [`apps/mobile/CONTEXT.md`](apps/mobile/CONTEXT.md)                       | [`apps/mobile/ARCHITECTURE.md`](apps/mobile/ARCHITECTURE.md)                       | [`apps/mobile/docs/adr/`](apps/mobile/docs/adr/)                       |
| **Desktop Client**       | [`apps/desktop/CONTEXT.md`](apps/desktop/CONTEXT.md)                     | [`apps/desktop/ARCHITECTURE.md`](apps/desktop/ARCHITECTURE.md)                     | [`apps/desktop/docs/adr/`](apps/desktop/docs/adr/)                     |
| **Control Plane**        | [`services/control-plane/CONTEXT.md`](services/control-plane/CONTEXT.md) | [`services/control-plane/ARCHITECTURE.md`](services/control-plane/ARCHITECTURE.md) | [`services/control-plane/docs/adr/`](services/control-plane/docs/adr/) |
| **Agent Runtime**        | [`services/agent-runtime/CONTEXT.md`](services/agent-runtime/CONTEXT.md) | [`services/agent-runtime/ARCHITECTURE.md`](services/agent-runtime/ARCHITECTURE.md) | [`services/agent-runtime/docs/adr/`](services/agent-runtime/docs/adr/) |
| **System-wide**          | this map                                                                 | [`ARCHITECTURE.md`](ARCHITECTURE.md)                                               | [`docs/adr/`](docs/adr/)                                               |

## Maintaining these docs (read before editing — esp. with `/grill-with-docs`)

This repo follows the `grill-with-docs` multi-context layout. When a term is resolved or an ADR is written, put it in the right place — do **not** recreate a single unified `docs/CONTEXT.md`.

**Where each kind of vocabulary lives — every term has exactly ONE owning context; other contexts reference it by name, never redefine it:**

- **Product-umbrella terms** (true of the whole system, owned by no single deployable — e.g. **Intentive**, **Companion**) → the `## Language` section of **this file** (`CONTEXT-MAP.md`).
- **The cross-context narrative** — `## Relationships`, `## Example dialogue`, and `## Flagged ambiguities` — also lives in **this file**, because it describes interactions _between_ contexts. Per-context `CONTEXT.md` files keep only their own terms (plus, optionally, a context-local Flagged-ambiguities for purely internal naming clashes, as `services/agent-runtime/CONTEXT.md` does).
- **Wire/HTTP-contract and cross-cutting terms** (e.g. **Protocol**, **Context Snapshot**, **Session End Marker**, **Internal API**) → **`packages/CONTEXT.md`** (the Shared context), since they're imported by multiple deployables.
- **Deployable-specific terms** → that deployable's own `CONTEXT.md` (`apps/mobile/`, `apps/desktop/`, `services/control-plane/`, `services/agent-runtime/`).
- **Boundary-spanning terms** (a flow that touches two contexts, e.g. **Session Start** = Control Plane → Agent Runtime) → assign to the context that _owns/initiates_ the concept; the other context references it by name.

**Adding or renaming a term:** edit the single owning `CONTEXT.md` (use the Contexts table above to find it); if it's an umbrella/cross-cutting term, edit this file. Keep one definition; link related terms with **bold names**, not duplicate definitions.

**Writing `_Avoid_` lines:** avoid terms are product-vocabulary guardrails, not a ban on exact implementation names. Do not put a bare framework, library, vendor, or protocol name in `_Avoid_` when agents may need to reference it accurately in technical comments or source docs (for example, `Expo Router`, `Tauri invoke()`, `ScreenPipe`, `Neon Auth`). Prefer product-alias phrases that show the actual drift: `Expo app` → **Mobile Client**, `Tauri app` → **Desktop Client**, `backend` → **Control Plane**. This lets the CONTEXT vocabulary lint catch product/domain naming drift without deleting useful implementation breadcrumbs.

**ADRs:** system-wide decisions → `docs/adr/`, numbered from `0001`. Context-specific decisions → that deployable's own `docs/adr/`, numbered independently from `0001`. A reference from a context ADR to a system-wide one is written **monorepo ADR-NNNN** with a relative link into `docs/adr/`. See [`docs/adr/README.md`](docs/adr/README.md) for the full convention and the historical old→new number map.

## Language

**Intentive**:
The whole product system — Mobile Client, Desktop Client, Control Plane, Agent Runtime, and the durable state they share.
_Avoid_: macOS app, mobile app, the agent, the backend

**Companion**:
The product-facing concept of the proactive agent the user talks to. What the user thinks they are interacting with.
_Avoid_: Execution Companion, chatbot, assistant, agent (as a noun for the product), bot

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
- The two **Internal API** directions each trust the caller via a **Directional Secret** (one secret guards calls to the Agent Runtime, a separate secret guards calls to the Control Plane) on a private network interface. User JWT auth is separate and used only on the public WebSocket.
- **Conversation History** is server-truth. The Mobile Client renders the authoritative timeline streamed back on WebSocket reconnect; it stores nothing locally.
- The **Snapshot Store** on the Desktop Client is unrelated to chat history. It is local-truth for snapshots the device itself produced.
- On the **Desktop Client**, **Routing State** (do we hold valid Routing from `GET /agent`?) and **Session State** (is the Protocol WebSocket up right now?) are independent — see [`apps/desktop/CONTEXT.md`](apps/desktop/CONTEXT.md). Settings sees only a plain connection mood; JWT and `ws_url` stay in Rust.
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
- "Control Plane mints the runtime JWT with its own signing key" was implied by PRD/issue wording ("`GET /agent` mints the runtime JWT"). Resolved for v1: the `runtime_jwt` is the client's **Neon Auth user JWT passed through**, not a Control-Plane-signed token. The Agent Runtime verifies it with the one shared Neon Auth JWKS verifier (#15) — there is no second signing key and no second verifier. "Mint" means "issue/hand back," not "sign with a CP key." Recorded as control-plane ADR-0002.
