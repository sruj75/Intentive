# Control Plane

The stateless server-side authority for identity, routing, pre-chat gate state, devices, and notifications. For monorepo-wide vocabulary and the context map, read the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md). This file captures vocabulary specific to the Control Plane.

## Language

**Control Plane**:
The server-side authority at `services/control-plane/`. Owns identity, device registry, agent instance registry, pre-chat gate state, and routing. Sits **beside** the client↔runtime data path, never **on** it.
_Avoid_: backend, mobile backend, desktop backend, API, proxy, gateway

**Routing**:
The Control Plane's job of telling each signed-in client _where_ the Agent Runtime is and _who_ the client is (URL + JWT). Routing happens **once, before** the data connection opens. The Control Plane is not in the path of any subsequent message. The `runtime_jwt` it returns is the client's **Neon Auth user JWT passed through** — the Control Plane does not mint a token with its own signing key. The Agent Runtime verifies it with the single shared Neon Auth JWKS verifier (`packages/providers`), the same one the Control Plane uses on its public endpoints.
_Avoid_: proxying, forwarding, gatewaying, minting a Control-Plane-signed token

**Pre-Chat Gate**:
A client-visible step the Control Plane requires (or offers) before a User enters chat. Gates fall into two kinds:

- **Cross-Client Gate** — once completed on any device, the Control Plane records it and no other client of the same User re-prompts. Examples: **Identity Gate**, **Consent Primer**, **Sibling Client Invitation** (skip).
- **Device-Local Gate** — must be completed on the specific device that requires it; cross-client completion does not satisfy it. Example: **Capture Permission Setup** (macOS Privacy Settings can only be granted on the Mac that records).

The Control Plane's `GET /me` returns the caller's **Account State**, including `next_gate`. Today (#26) that gate is computed from **cross-client completion state only** — Consent Primer, then Sibling Client Invitation skip. **Identity** is satisfied by the auth boundary (a 200 from `GET /me` means signed-in); the gate sequencer does not return `identity`. **`client_kind` branching and Device-Local gates (Capture Permission Setup) land in #27** — until then, one endpoint and one cross-client model behind it.
_Avoid_: per-screen onboarding flag, client-local gate state, separate endpoints per gate

**Identity Gate**:
The Google sign-in step (Apple sign-in later). **Cross-Client Gate**. Same Google account on phone and Mac resolves to the same User.

**Consent Primer**:
The one-time relationship-consent screen explaining memory, follow-ups, and user control. **Cross-Client Gate**. Asked once per User across all clients.

**Sibling Client Invitation**:
An optional client-offered prompt to install the other client (Mobile invites to install Desktop, and vice versa). **Cross-Client Gate** for _skip_ state — skipping on either client records "skipped for now" and removes it from active gate flow on both. Re-offered later only when a contextual reason appears.

**Session Start**:
The single, synchronous, idempotent internal call from Control Plane → Agent Runtime when a user first enters chat. One call (`POST /internal/sessions/start`) creates the **Agent Instance** if missing and fires the **Conversation Start Trigger**, returning routing info (`agent_instance_id`, `ws_url`).
_Avoid_: Agent Instance Creation + Conversation Start Trigger as separate calls, async provisioning

**Conversation Start Trigger**:
The one-time, idempotent-per-User signal that tells the Agent Runtime to begin the first conversation. Fires as part of **Session Start**, not as a separate call.
_Avoid_: standalone endpoint, client-issued trigger, repeated triggers across reconnects

**Push Notification**:
An APNs (or later FCM) push delivered to a User's device(s). Always originates from **Post-Message-Back**. The Agent Runtime does not call APNs directly — it asks the Control Plane, which owns device tokens and Apple credentials.
_Avoid_: in-app banner, toast, transport ping
