## Bird's-eye Overview

`v1-deepagent` is the Intentive runtime product. It is a WebSocket-first, multi-tenant, user-scoped DeepAgents runtime that executes one continuous session per user, backed by durable runtime state in Neon.

Primary architecture is **vertical shell components** (gateway, sessions, channels, routing, heartbeat/cron/hooks). Horizontal layers exist to keep implementation enforceable and testable, but they do not replace vertical ownership.

## Codemap

Vertical components are the primary system shape:

- `src/gateway`: WebSocket transport, handshake, protocol validation, auth boundary.
- `src/sessions`: session lifecycle, continuity, snapshot/reconnect semantics.
- `src/channels`: client surface adapters/events normalization.
- `src/routing`: deterministic mapping from inbound metadata to user/session execution path.
- `src/runtime`: DeepAgents orchestration boundary and turn execution coordination.
- `src/heartbeat`: proactive follow-up/liveness workflows.
- `src/cron`: scheduled jobs and recurring triggers.
- `src/hooks`: lifecycle extension points around runs/events.
- `src/workspace`: DeepAgents VFS-backed virtual document semantics, bundle resolution, and overlay policies.

Horizontal implementation slices are enforced inside and across those verticals:

- `src/types` -> `src/config` -> `src/repo` -> `src/service` -> `src/runtime` -> `src/ui`
- `src/providers` is the only cross-cutting integration path (auth, telemetry, connectors, flags).

Contract docs:

- `CONTEXT.md`: domain language and confirmed runtime behavior contracts.
- `docs/adr/`: hard-to-reverse decisions and divergence rationale.
- `reference/`: OpenClaw/Hermes pattern inputs.

## Architectural Invariants

- Canonical runtime scope keys are `(tenant_id, user_id)`.
- Exactly one active writable session per user in v1.
- Per-user event handling is strictly ordered through one queue; no parallel turn execution for same user.
- Connect/reconnect protocol is snapshot-first then live stream.
- WebSocket-first transport; event ingress is one typed event surface.
- WebSocket protocol contract is locked in `docs/adr/0003-websocket-protocol-contract-v1.md` for cross-repo client alignment.
- Unknown inbound event types are rejected.
- Runtime data is authoritative in Neon (runtime-owned schema); memory is cache only.
- DeepAgents VFS is modeled as an agent-facing projection over durable storage, not host filesystem truth.
- Intentive runtime behavior docs are managed as versioned immutable runtime bundle documents.
- User/tenant personalization and operational memory are writable overlays over the pinned bundle defaults.
- Runtime read resolution order is overlay first, then pinned bundle defaults.
- Full per-user host-file materialization is not the default; materialize only when a specific tool/backend requires OS-level files.
- Session behavior is deterministic via bundle-version pinning; upgrades occur only at controlled boundaries.
- Deepagent verifies JWT locally through shared JWKS; no per-request control-plane auth callback.
- Effect-first for non-trivial behavior orchestration: explicit success/error/requirements channels.
- Reference-first design: follow OpenClaw shell patterns by default; document intentional divergences for DeepAgents/Intentive constraints.
- Divergence policy: OpenClaw shell patterns are default; pattern-level divergence requires ADR rationale and containment invariants (see `docs/adr/0001-openclaw-patterns-default.md`).

- Vertical-first ownership: shell components are primary seams; do not force full internal mini-layer stacks in every vertical at project start.
- Progressive layering: apply deeper horizontal decomposition inside a vertical only when complexity signals appear; see `docs/adr/0002-vertical-first-progressive-layering.md`.
- Initial mandatory seams in v1: `gateway/protocol`, `gateway/auth`, `sessions/queue`, `runtime/adapter`.
- Virtual document and overlay policy is defined in `docs/adr/0004-db-backed-vfs-overlay-model-v1.md`.

## Boundaries

- Control Plane boundary: source of truth for account/auth/device/commercial policy. Deepagent consumes verified identity and routing context but owns runtime product behavior contracts.
- Client boundary (Expo/Tauri): clients are views and transport peers; they do not own ordering, session truth, or behavior decisions.
- Data boundary: deepagent owns runtime data tables only; no cross-service joins into control-plane tables.
- Runtime boundary: DeepAgents provides the reasoning/runtime substrate and VFS interface; deepagent owns product-level behavior, execution policy, bundle management, and overlay persistence semantics.
- Cross-cutting integrations must enter via `Providers` interfaces only (auth/JWKS, telemetry, external connectors).

## Cross-cutting Concerns

- Auth: JWT verification and identity extraction handled by provider boundary; downstream modules consume resolved identity context.
- Observability: structured logs/metrics/traces on connect, queueing, turn start/finish, persistence, and stream delivery.
- Configuration: typed config decode + validation at startup; fail fast on invalid runtime config.
- Reliability: deterministic ordering and idempotent event handling for reconnect/resend safety.
- Mechanical enforcement target: directional module dependency policy `types -> config -> repo -> service -> runtime -> ui`, with cross-cutting access only via `providers`.
