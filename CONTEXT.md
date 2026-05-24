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
The Control Plane capability that signs an Identity into Intentive and exposes the resulting User to clients. Built on Neon Auth (Better Auth) in v1, Google as the v1 provider.
_Avoid_: login screen, client-side auth library

**Onboarding**:
The cross-client, one-time relationship-formation state owned by the Control Plane. Onboarding is either `incomplete` or `complete` for a User. A second Client App for the same User must not present onboarding again once it is `complete`.
_Avoid_: per-client onboarding, per-device onboarding, screen-local onboarding flag

**Onboarding Submission**:
The single request a client sends after collecting onboarding answers. The Control Plane validates, persists answers, marks onboarding `complete`, and triggers **Agent Provisioning**. Idempotent on User.
_Avoid_: partial save, per-screen save, client-side completion flag

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
The remote system where the user's Execution Companion / DeepAgent actually runs. In v1 this is a DeepAgent / OpenClaw-compatible runtime per User.
_Avoid_: Control Plane, client app, generic LLM endpoint

**Agent Instance**:
The concrete deployed Agent Runtime for one User: a runtime URL, credentials, and lifecycle status. Exactly one per User in v1.
_Avoid_: per-device instance, per-client instance

**Agent Instance Registry**:
The Control Plane table mapping each User to their Agent Instance and recording its lifecycle status (`provisioning`, `active`, `failed`, `paused`).
_Avoid_: client-stored runtime URL

**Agent Provisioner**:
The Control Plane-internal module that talks to cloud infrastructure (GCP in v1) to create the Agent Runtime for a newly-onboarded User. Clients never call it directly.
_Avoid_: client-side provisioner, manual deploy

**Provisioning State**:
The Control Plane-owned lifecycle of an Agent Instance from request through `active`. Exposed to clients only as the status of `agent_instance`, not as raw cloud calls.
_Avoid_: client-visible GCP state, raw cloud operation log

**Durable State**:
The Neon Postgres data owned exclusively by the Control Plane: users, onboarding, devices, agent instances, provisioning records, and routing.
_Avoid_: client cache, runtime memory, screenshot store

**Neon Postgres**:
The single durable database for the Control Plane. Clients have no direct Neon access. Agent Runtimes have no direct Neon access for Control Plane tables.
_Avoid_: shared db with client, shared db with runtime

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
The HTTP API surface a Client App calls. The current v1 surface: `GET /me`, `POST /onboarding/submit`, `GET /agent`, `POST /devices/register`, `WS /events`.
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

1. Client opens → Google sign-in → Control Plane resolves/creates **User**.
2. Client calls `GET /me` → receives **Account State**.
3. If `onboarding = incomplete`, client renders onboarding, then `POST /onboarding/submit`.
4. Control Plane persists answers, marks onboarding `complete`, triggers **Agent Provisioning**.
5. Client polls (or listens on `WS /events` for) `agent_instance.status = active`.
6. Client calls `POST /devices/register` (idempotent on Device fingerprint) → receives **Device Id**.
7. Client calls `GET /agent` → receives **Routing** info.
8. Client opens **Runtime Connection** to the Agent Runtime.

When the second Client App is later opened by the same User: steps 1, 2, 6, 7, 8 only. Step 3 and 4 never repeat. The Control Plane never lets the second client re-onboard or re-provision.

## Scope (v1)

In:

- Identity via Neon Auth (Google).
- One User → one Agent Instance.
- Onboarding submission and completion truth.
- Device Registry for Mobile and Desktop Clients.
- Agent Provisioner integration with GCP.
- `GET /me`, `POST /onboarding/submit`, `GET /agent`, `POST /devices/register`, `WS /events`.
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
- "Onboarding completion" — resolved: per-User, owned by the Control Plane. Never per-client, never per-device.
- "Agent per device" — rejected: agents are per-User. Devices are per-install and route to the same Agent Instance.
- "Control Plane proxies chat" — rejected: the Control Plane only issues routing; it does not sit in the runtime data path.
- "Clients can read Neon directly" — rejected: Neon is exclusive to the Control Plane.
- "Conversation history lives in the Control Plane" — rejected for v1: conversation content is Agent Runtime concern; the Control Plane stores only the data needed for identity, onboarding, devices, agent instances, and routing.
- Apple sign-in, web client, multi-agent, org accounts — **deferred**.
- Exact `WS /events` payload shape — **deferred** until first client integration; the boundary is recorded but the schema is not.
- Device fingerprinting strategy for idempotent registration — **deferred**; the contract is "client posts a stable fingerprint, server is idempotent on it."
