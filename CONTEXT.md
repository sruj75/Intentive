# Intentive Control Plane

The Control Plane is the server-side brain of Intentive account setup. It owns identity, onboarding truth, the device registry, the agent instance registry, provisioning coordination, Neon database access, and the routing of each signed-in user to their one **Agent Runtime**. Client apps (Mobile Client, Desktop Client) are views. The Control Plane is truth. The DeepAgent is behavior. Neon is durable state.

This repo is the Control Plane. It is not a client, not an agent runtime, and not a provisioning script — it is the single boundary every client talks to and the single coordinator that talks to the agent provisioner and Neon.

## Language

**Intentive**:
The broader product system spanning Mobile Client, Desktop Client, Control Plane, Durable State, Agent Provisioner, and Agent Runtime.
_Avoid_: control plane only, one app, one platform

**Control Plane**:
The single server-side authority for Intentive account state. It owns identity, onboarding completion, the **Device Registry**, the **Agent Instance Registry**, **Provisioning State**, Neon access, and routing of a signed-in user to their **Agent Runtime**.
_Avoid_: thin proxy, mobile backend, desktop backend, agent runtime, provisioning script

**Client App**:
A user-facing Intentive surface (currently the **Mobile Client** and the **Desktop Client**). A Client App displays product state from the Control Plane; it does not decide onboarding completion, device registration, agent lifecycle, or routing.
_Avoid_: lifecycle owner, source of truth, agent runtime

**Mobile Client**:
The Expo iOS client surface for Intentive.
_Avoid_: mobile backend, mobile control plane

**Desktop Client**:
The Tauri macOS client surface for Intentive.
_Avoid_: desktop backend, desktop control plane

**User**:
The single Intentive identity that owns shared onboarding, devices, and the Agent Runtime. A User has exactly one identity across all Client Apps.
_Avoid_: per-device account, per-client account

**Identity**:
The Google (and later Apple) authenticated principal that maps to a User. Identity resolution is the first thing the Control Plane does for any client request.
_Avoid_: device id, session token alone

**Auth**:
The Control Plane capability that signs an Identity into Intentive and exposes the resulting User to clients. Built on Neon Auth (Better Auth) in v1, Google as the v1 provider. Issues **JWT** session tokens carrying `user_id` (short-lived access token + refresh token).
_Avoid_: login screen, client-side auth library, opaque session table

**JWT Verification**:
Both the **Control Plane** and the **Agent Runtime** verify Neon Auth JWTs independently using the shared Neon Auth JWKS — neither service holds a session table, and the Runtime does not call the Control Plane to authenticate a client. A client presents the same JWT to both services and is identified as the same User on each.
_Avoid_: shared session store, Runtime calling Control Plane on every connect, per-service auth tokens

**Pre-Chat Gate**:
A client-visible step required or offered before entry into Companion Chat. The v1 gates are **Identity Gate** (auth), **Consent Primer** (one-time relationship consent), and **Sibling Client Invitation** (e.g., macOS Setup from Mobile). The Control Plane owns the cross-client completion state of each gate and tells clients which gate is next via `GET /me`.
_Avoid_: per-client gate state, screen-local onboarding flag, form questionnaire

**Consent Primer**:
The one-time, cross-client relationship-consent bit for the User. Once recorded by the Control Plane, no Client App for the same User asks for it again.
_Avoid_: per-device consent, per-client repetition

**Sibling Client Invitation**:
A product-level invitation surfaced by one Client App to install the other (Mobile's "macOS Setup," Desktop's mobile equivalent). The Control Plane records when a User skips it so it does not return as an ordinary launch gate; the Control Plane does not author the invitation UX itself.
_Avoid_: server-pushed install prompt, platform-ownership claim

**Relationship Onboarding**:
The first conversation the Agent Runtime runs via its `bootstrap.md`. **Owned by the Runtime, not the Control Plane.** The Control Plane never sees onboarding answers, never has an "onboarding answers" table, and exposes no `POST /onboarding/submit` endpoint.
_Avoid_: Control-Plane-stored answers, form-submit endpoint, client-authored opening message

**Conversation Start Trigger**:
The one-time, Control-Plane-owned, idempotent-per-User request that tells the Agent Runtime to begin the first Companion Chat conversation after all Pre-Chat Gates pass. If Mobile and Desktop both enter the chat surface during the same first-entry window, exactly one trigger fires — never one per device.
_Avoid_: per-device trigger, client-issued trigger, repeated triggers across reconnects

**Device**:
A specific Client App installation belonging to a User (one iPhone Expo install, one Mac Tauri install). Devices are identified by a Control Plane-issued **Device Id**.
_Avoid_: account, user, identity

**Device Registry**:
The Control Plane table of all Devices for all Users, recording which platform, when registered, and current connection status.
_Avoid_: client-local device list

**Device Registration**:
The endpoint a Client App calls after sign-in to introduce itself to the Control Plane and receive a Device Id.
_Avoid_: client-generated device id, anonymous push token

**Agent Runtime**:
The shared, multi-tenant runtime service where every User's agent behavior executes. Lives in its own repo ([**`sruj75/v1-deepagent`**](https://github.com/sruj75/v1-deepagent)), deployed as a separate service from the Control Plane. Built in-house on top of [`langchain-ai/deepagentsjs`](https://github.com/langchain-ai/deepagentsjs); inspired by OpenClaw but explicitly not OpenClaw, because OpenClaw's default is one VM per user.
_Avoid_: per-user VM, OpenClaw (the open-source project), in-process with Control Plane, client app, generic LLM endpoint

**Runtime Base URL**:
The Control Plane-configured (env var) base URL of the `v1-deepagent` service. The Control Plane calls it server-to-server to create Agent Instances; clients receive a per-User runtime URL derived from it for opening their **Runtime Connection** directly.
_Avoid_: client-baked URL, per-User DNS

**Agent Instance**:
The logical per-User agent record (id, config, conversation handle, status) inside the multi-tenant **Agent Runtime**. Compute is shared across many Agent Instances; an Agent Instance is not a dedicated VM.
_Avoid_: per-user VM, per-device instance, per-client instance

**Agent Instance Registry**:
The Control Plane table mapping each User to their Agent Instance and recording its lifecycle status (`provisioning`, `active`, `failed`, `paused`).
_Avoid_: client-stored runtime URL

**Agent Provisioner**:
The Control Plane-internal module that talks to cloud infrastructure (GCP in v1) to create the Agent Runtime for a newly-onboarded User. Clients never call it directly.
_Avoid_: client-side provisioner, manual deploy

**Agent Instance Creation**:
The synchronous Control Plane operation that, on **Onboarding Submission**, allocates an Agent Instance in the multi-tenant Agent Runtime and returns its routing info in the same HTTP response. No `provisioning` lifecycle in v1 because there is no slow async work — the runtime is already running.
_Avoid_: provisioning lifecycle, status polling, GCP boot wait

**Durable State**:
The Neon Postgres data owned exclusively by the Control Plane: users, onboarding, devices, agent instances, provisioning records, and routing.
_Avoid_: client cache, runtime memory, screenshot store

**Neon Postgres**:
The Control Plane's durable store. The Control Plane and Agent Runtime share the **same Neon project** but use **separate databases (or schemas) with separate roles**, so each service's database user can only see its own tables. Clients have no direct Neon access. The Agent Runtime cannot read Control Plane tables, and the Control Plane cannot read Runtime tables — the boundary is enforced by Postgres grants, not convention.
_Avoid_: shared schema, cross-service JOINs, client-direct Neon access

**Runtime Data**:
Conversation history, agent memory, tool calls, summaries, and any other state the Agent Runtime needs to do its job. **Owned exclusively by the Agent Runtime**, behind the Runtime's interface. The Control Plane never reads or writes Runtime Data tables.
_Avoid_: shared messages table, Control Plane-owned conversation, analytics querying message tables directly

**Account State**:
The Control Plane's compact answer to "what state is this User in?" — identity, onboarding status, registered devices, agent instance status, runtime URL. Returned by `GET /me`.
_Avoid_: separate `/onboarding`, `/agent`, `/devices` calls a client must combine

**Routing**:
The Control Plane responsibility of giving each signed-in User the correct Agent Runtime URL and credentials for connecting their clients to it.
_Avoid_: hard-coded runtime in client, DNS-only routing

**Runtime Connection**:
The client→Agent Runtime channel (websocket / event stream) that a client opens using Control Plane-issued routing info. The Control Plane does not proxy runtime traffic.
_Avoid_: proxied chat through Control Plane

**Sibling Client Invitation**:
A product-level invitation surfaced by one Client App to install the other. The Control Plane records that the user already has one Client App registered; it does not initiate or own the invitation UX.
_Avoid_: server-pushed install prompt, platform-ownership claim

**Account Contract**:
The HTTP API surface a Client App calls. The current v1 surface: `GET /me`, `POST /consent` (records Consent Primer completion), `POST /sibling-invitation/skip`, `GET /agent`, `POST /devices/register`.
_Avoid_: per-client custom endpoints, expo-only endpoints, tauri-only endpoints

## Relationships

- **Intentive** is composed of replaceable **Client Apps**, one **Control Plane**, one **Agent Provisioner**, one **Neon Postgres**, and per-User **Agent Runtimes**.
- A **User** has exactly one **Identity**, one **Onboarding** record, zero-or-more **Devices**, and exactly one **Agent Instance** (after onboarding completes).
- **Client Apps** display **Account State** from the Control Plane; they do not decide it.
- **Auth** resolves an **Identity** into a **User**; every subsequent Control Plane call is User-scoped.
- A **User** may first sign in from either the **Mobile Client** or the **Desktop Client**; the Control Plane finds-or-creates the User and returns the same **Account State** in both cases.
- **Onboarding** is owned at the User level; opening the other Client App after onboarding completes must result in `onboarding = complete` and skipping the onboarding UI.
- **Onboarding Submission** is the only writer of `onboarding = complete`. It also enqueues **Agent Provisioning**.
- **Agent Provisioning** moves an **Agent Instance** through **Provisioning State** until it is `active`; only then can clients open a **Runtime Connection**.
- **Device Registration** creates a **Device** row in the **Device Registry** and is required before a Client App opens a **Runtime Connection**.
- The Control Plane provides **Routing** info (runtime URL + credentials) via `GET /agent`; clients open the **Runtime Connection** directly to the Agent Runtime.
- The Control Plane never proxies user↔Agent Runtime traffic. It only issues routing.
- The **Agent Provisioner** is internal to the Control Plane; clients have no path to it.
- **Durable State** lives exclusively in **Neon Postgres** and is accessed only by the Control Plane.
- A **Sibling Client Invitation** is a Client App concern; the Control Plane only exposes "this User has these registered Devices" so a client can decide whether to invite.
- Every endpoint in the **Account Contract** is User-scoped after auth and idempotent where it represents a one-time lifecycle transition.

## Lifecycle (canonical)

The same lifecycle holds whether the User starts in Mobile or Desktop:

1. Client opens → Google sign-in → Control Plane resolves/creates **User** (passes **Identity Gate**).
2. Client calls `GET /me` → receives **Account State** including the next **Pre-Chat Gate** (or "enter chat").
3. If next gate is **Consent Primer**, client renders the consent screen → `POST /consent`.
4. If next gate is **Sibling Client Invitation**, client renders the invitation; skip → `POST /sibling-invitation/skip`; accept → client-side install/connect flow.
5. When all Pre-Chat Gates pass and the User first enters Chat, the Control Plane (synchronously, idempotently per User):
   - Creates the **Agent Instance** in the Agent Runtime if it does not yet exist.
   - Emits exactly one **Conversation Start Trigger** to the Runtime.
6. Client calls `POST /devices/register` (idempotent on Device fingerprint) → receives **Device Id**.
7. Client calls `GET /agent` → receives routing info → opens **Runtime Connection** directly to the Agent Runtime.
8. **Relationship Onboarding** happens *inside* the chat, driven by the Runtime's `bootstrap.md`. The Control Plane is not involved.

When the second Client App is later opened by the same User: steps 1, 2, 6, 7 only. No second Agent Instance, no second Conversation Start Trigger, no repeated Consent Primer. Step 3 and 4 never repeat. The Control Plane never lets the second client re-onboard or re-provision.

## Scope (v1)

In:

- Identity via Neon Auth (Google).
- One User → one Agent Instance.
- Onboarding submission and completion truth.
- Device Registry for Mobile and Desktop Clients.
- Agent Provisioner integration with GCP.
- `GET /me`, `POST /consent` (records Consent Primer completion), `POST /sibling-invitation/skip`, `GET /agent`, `POST /devices/register`.
- Neon Postgres as sole durable store.

Deferred:

- Multi-agent per user, fan-out.
- Org / team accounts.
- Apple sign-in.
- Self-hosted runtimes.
- Client-visible provisioning logs.
- Web client.

Out:

- Proxying user↔runtime chat traffic.
- Storing conversation content (the Agent Runtime / Neon-via-runtime owns that).
- Client-side direct Neon access.
- Per-client onboarding state.
- Per-device agent instance.

## Example dialogue

> **Dev:** "If the user signs in on Tauri after onboarding on Expo, who decides whether to show onboarding?"
> **Control Plane:** "I do. Tauri calls `GET /me`, I return `onboarding = complete`, Tauri skips its onboarding UI."

> **Dev:** "Should the Mac client talk to the GCP Provisioner to spin up the agent?"
> **Control Plane:** "No. Clients never see the provisioner. I own provisioning end-to-end; clients only observe `agent_instance.status`."

> **Dev:** "Where does conversation history live?"
> **Control Plane:** "Not in me. I own identity, onboarding, devices, agent instances, and routing. Conversation behavior and content live in the Agent Runtime."

> **Dev:** "Can the mobile client send messages through the Control Plane?"
> **Control Plane:** "No. I issue routing; the client opens a direct Runtime Connection. Proxying user↔runtime traffic would make me a chokepoint with no value."

> **Dev:** "User registers two iPhones — does that create two agents?"
> **Control Plane:** "No. Agents are per-User. Devices are per-install. Both iPhones get rows in the Device Registry and route to the same Agent Instance."

## Flagged ambiguities

- "Backend" — resolved: the Control Plane is the backend boundary clients call; the Agent Runtime is a separate backend that clients connect to directly using Control Plane-issued routing.
- "Onboarding completion" — resolved: there is **no Control-Plane "onboarding complete" bit**. Onboarding-the-conversation is owned by the Agent Runtime via `bootstrap.md`. The Control Plane owns only **Pre-Chat Gate** completion (Identity, Consent Primer, Sibling Invitation skip) — the small set of facts a second Client App needs to know to not re-prompt the User. Relationship Onboarding answers live exclusively in **Runtime Data**.
- "Agent per device" — rejected: agents are per-User. Devices are per-install and route to the same Agent Instance.
- "Control Plane proxies chat" — rejected: the Control Plane only issues routing; it does not sit in the runtime data path.
- "Clients can read Neon directly" — rejected: Neon is exclusive to the Control Plane.
- "Conversation history lives in the Control Plane" — rejected: conversation history, agent memory, tool calls, and summaries are **Runtime Data**, owned exclusively by the Agent Runtime behind its own interface. The Control Plane never reads or writes those tables. **Caveat:** if the Control Plane later needs facts derived from Runtime Data (e.g., "has this User ever sent a message?", "last activity timestamp"), it does **not** reach into Runtime tables. Either the Runtime emits an event the Control Plane records as its own fact, or the Control Plane asks the Runtime over its HTTP interface. The schema stays private.
- "`WS /events` push channel from Control Plane to clients" — rejected for v1. Agent Instance Creation is synchronous, so there is no provisioning event to push. Remaining cross-device sync needs (e.g., "the other device just registered," "you were signed out elsewhere") are answered by clients re-fetching `GET /me` on foreground. Control Plane is HTTP request/response only in v1. Reintroduced (likely as SSE) only when a concrete real-time need shows up.
- "Same Neon project vs different Neon projects for Control Plane and Runtime" — resolved: **same Neon project, separate databases (or schemas) with separate Postgres roles.** One billing account, one console, easier local dev; the boundary that matters (schema ownership) is enforced at the database permission layer. If scale or compliance later demands physical separation, splitting is mechanical.
- "One VM per User vs multi-tenant runtime" — resolved: **multi-tenant**. OpenClaw's default is one VM per user, which is why we are building our own runtime inspired by it. Intentive's Agent Runtime shares compute across Users; an Agent Instance is a logical record, not a dedicated VM.
- Apple sign-in, web client, multi-agent, org accounts — **deferred**.
- Exact `WS /events` payload shape — **deferred** until first client integration; the boundary is recorded but the schema is not.
- Device fingerprinting strategy for idempotent registration — **deferred**; the contract is "client posts a stable fingerprint, server is idempotent on it."
