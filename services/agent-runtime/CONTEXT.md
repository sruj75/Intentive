# CONTEXT: v1-deepagent

## Mission

Build the Intentive runtime product on LangChain DeepAgents in TypeScript, with always-on proactive behavior, durable execution memory, and multi-tenant isolation.

## Confirmed Terms

### System Role
`v1-deepagent` is Intentive runtime product truth for execution behavior (onboarding gate, companion contract, heartbeat/cron intervention semantics, runtime memory semantics). Clients are views. `v1-control-plane` is account/auth/device/commercial truth. Neon is durable state.

### Identity Trust Boundary
`v1-deepagent` trusts identity asserted by validated auth from the Control Plane/Auth system. It does not accept client-asserted identity as truth.

### Canonical Runtime Scope Keys (v1)
Runtime state is scoped by `(tenant_id, user_id)`.
`user_id` remains the per-user execution key; `tenant_id` is required for multi-tenant isolation boundaries.

### Session Ownership (v1)
Sessions are user-scoped and shared across clients.

### Active Session Policy (v1)
Each user has exactly one active continuous session in v1.

### Concurrency Policy (v1)
Incoming user events are processed through a single strict-ordered queue per `user_id`.

### Reconnect Consistency Policy (v1)
When a client connects/reconnects, deepagent sends the current session timeline snapshot first, then streams live updates.

### Auth Verification Model (v1)
Deepagent verifies JWTs locally using Neon/Auth JWKS.

### Gateway API Shape (v1)
Deepagent exposes a unified events surface, not many narrow feature endpoints.

### Transport Model (v1)
WebSocket-first transport.

### Runtime Durability Model (v1)
Deepagent runtime data is authoritative in Neon (runtime-owned schema), with memory used as a cache/acceleration layer.

### Virtual Document Model (v1)
DeepAgents VFS is an agent-facing projection over durable storage. For product design and persistence, VFS paths are treated as database records, not host filesystem truth.

### Runtime Bundle Model (v1)
Intentive behavior docs (for example `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`) are managed as versioned runtime bundle documents.

### Overlay Resolution Model (v1)
Runtime reads resolve as:
1. tenant/user overlay document when present
2. otherwise pinned bundle default document

### Materialization Policy (v1)
Do not clone full per-user file trees by default.
Materialize host files only when a specific tool/backend requires OS-level files.

### Runtime Mutability Policy (v1)
Writable surfaces are explicit and minimal (for example `USER.md`, daily memory traces, follow-up state projections). Base bundle docs are immutable within a running session.

### Session Bundle Pinning Policy (v1)
Each runtime session is pinned to one bundle version for deterministic behavior.
Bundle upgrades occur at controlled boundaries (for example reconnect or new session), not mid-turn.

### Scratch vs Durable Storage (v1)
Thread scratch artifacts can use thread-scoped runtime state backends.
Cross-thread runtime memory and user-specific personalization must persist in durable store-backed backends.

### Inbound Event Contract Strictness (v1)
Inbound client event types are fixed and explicit in schema; unknown event types are rejected.

### Initial Inbound Event Set (v1)
The initial allowed inbound event types are:
- `user_message`
- `presence_update`
- `delivery_ack`

### Gateway Handshake Contract (v1)
WebSocket requires an explicit `connect` handshake before any runtime events are processed.

Handshake inputs:
- auth token
- client metadata (platform/app/version)
- protocol version range

Handshake outputs:
- success: `hello_ok` with negotiated protocol, policy, and initial session snapshot
- failure: structured error (for example auth failure, protocol mismatch, retryable unavailable)


### Message Idempotency (v1)
Inbound `user_message` events must include a client-generated `message_id`.
Deepagent enforces idempotency on `(user_id, message_id)` and executes each logical message once.

### Reference Strategy
Default to OpenClaw behavioral patterns (and Hermes where relevant) before inventing new architecture.
Only diverge when DeepAgents constraints or Intentive product constraints require it, and document the divergence explicitly.


### Pre-Handshake Frame Rule (v1)
Before handshake completion, deepagent accepts only the `connect` frame.
All other frames are rejected with structured protocol errors and produce no side effects.

### Architecture Enforcement Rule (v1)
Enforce layer dependency rules mechanically from day zero:
`types -> config -> repo -> service -> runtime -> ui`, with cross-cutting access only through `providers`.


### Vertical-First Module Policy (v1)
Primary architecture shape is vertical shell components (gateway, sessions, channels, routing, runtime, heartbeat, cron, hooks, workspace).

Horizontal layering is progressive, not mandatory boilerplate inside each vertical at project start.
We add deeper internal layer decomposition only when complexity signals justify it.

Initial mandatory seams:
- `gateway/protocol`
- `gateway/auth`
- `sessions/queue`
- `runtime/adapter`


### Protocol Meaning (v1)
"Protocol" means the application-level WebSocket message contract (frame/event schema and handshake semantics), not low-level transport internals.

Meaning:
- Client and server must agree on request/response/event shapes.
- If message contract versions do not overlap, deepagent rejects connect with structured protocol errors.
- This keeps client/server behavior aligned and debuggable across versions.

### Connect Metadata Minimum (v1)
The `connect` frame requires exactly these mandatory fields in v1:
- `auth_token`
- `client_kind` (`expo` | `tauri`)
- `client_version`
- `min_protocol`
- `max_protocol`

All other connect metadata is optional in v1.

### Live Stream Reliability Model (v1)
Outbound live stream delivery is at-most-once in v1.

Recovery model:
- reconnect returns authoritative snapshot first
- then live updates resume

This keeps the foundation reliable while avoiding replay/ack complexity in v1.

## Working Terms (not yet locked)

- Session lifecycle states
- Channel contract
- Routing rules
- Heartbeat model
- Cron job model
- Hook model
- Bundle migration policy details

## Boundaries

- `v1-deepagent` owns runtime behavior orchestration, session lifecycle, and Intentive companion product behavior contracts.
- `v1-deepagent` does not become account truth, billing truth, or device registry truth.
- Reference docs under `reference/` are pattern inputs, not copy-paste architecture mandates.


### ADR Linkage
Pattern-level divergences from OpenClaw defaults must be captured in ADRs and reference `docs/adr/0001-openclaw-patterns-default.md`.


Pattern and layering policy details are captured in `docs/adr/0002-vertical-first-progressive-layering.md`.

Protocol contract is formalized in `docs/adr/0003-websocket-protocol-contract-v1.md` for client integration references.

Virtual document and multi-tenant overlay policy is captured in `docs/adr/0004-db-backed-vfs-overlay-model-v1.md`.
