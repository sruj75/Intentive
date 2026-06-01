# Agent Runtime Architecture

This document is the deployable-local architecture contract for `services/agent-runtime/`. It extends the monorepo-wide rules in `../../docs/ARCHITECTURE.md`; it does not replace them. For vocabulary, read `../../docs/CONTEXT.md` (monorepo-wide) and [`../CONTEXT.md`](../CONTEXT.md) (deployable-local: Persistence Adapter, Bundle Path Set, Session Snapshot, VFS write policy, bundle version pinning) first.

## Bird's-eye Overview

The **Agent Runtime** is the always-alive, multi-tenant service that runs **Companion** behavior. It deploys as one Node/TypeScript process on GCE and serves many Users, with one logical **Agent Instance** per `user_id`.

DeepAgents is the brain. The Intentive Runtime shell is the product boundary around that brain.

```text
Mobile Client                 Desktop Client
  user_message                  context_snapshot/session_end_marker
       \                              /
        \-------- WebSocket Protocol-/
                       |
                    gateway
             auth, connect, protocol
                       |
                    sessions
          user_id queue and idempotency
                       |
                    protocol
          inbound event -> runtime command
                       |
                    runtime
              DeepAgents invocation
                       |
        memory + bundles + Conversation History
              Neon Runtime schema
                       |
       companion_message / Post-Message-Back
```

DeepAgents owns planning, tool execution, VFS semantics, skills, memory surface, subagents, and compaction. The Intentive shell owns WebSocket ingress, user isolation, event ordering, Cron, Heartbeat, Post-Message-Back, Control Plane handoff, Neon persistence policy, and deployment liveness.

OpenClaw/Hermes patterns are the local reference source for shell behavior. Start at `reference/AGENTS.md`, then load the relevant `reference/topics/*.md` card before reading raw `reference/openclaw/*-llms.txt` packs. Do not port upstream code verbatim.

## Codemap

`AGENTS.md`
: Agent-facing deployable guide. Read it before changing this service.

`CONTEXT.md`
: Deployable-local vocabulary: Persistence Adapter, Bundle Path Set, Session Snapshot, VFS write policy, bundle version pinning. Read alongside `docs/CONTEXT.md`.

`README.md`
: Operator/developer entrypoint for the deployable.

`docs/ARCHITECTURE.md`
: This file. Runtime-local architecture contract and map.

`services/agent-runtime/docs/plans/agent-runtime-v1-implementation-plan.md`
: Deployable-local phased implementation plan for the v1 Runtime.

`reference/`
: Read-only OpenClaw/Hermes pattern library. Topic cards explain what to borrow and what to leave to DeepAgents.

`src/index.ts`
: Thin process entrypoint. It should delegate to runtime composition, not accumulate domain logic.

Planned domain layout:

```text
src/domains/
  gateway/{types,config,repo,service,runtime,ui}/
  sessions/{types,config,repo,service,runtime,ui}/
  protocol/{types,config,repo,service,runtime,ui}/
  runtime/{types,config,repo,service,runtime,ui}/
  memory/{types,config,repo,service,runtime,ui}/
  bundles/{types,config,repo,service,runtime,ui}/
  cron/{types,config,repo,service,runtime,ui}/
  heartbeat/{types,config,repo,service,runtime,ui}/
  internal/{types,config,repo,service,runtime,ui}/
```

Domain responsibilities:

- `gateway`: WebSocket server, handshake-first connect flow, JWT verification, protocol version negotiation, socket lifecycle.
- `sessions`: Agent Instance lookup, per-`user_id` queueing, ordering, idempotency, connected-client presence.
- `protocol`: `packages/protocol` event parsing, inbound-to-command mapping, outbound event construction.
- `runtime`: DeepAgents construction/invocation, turn lifecycle, result classification, trace/run IDs.
- `memory`: DeepAgents memory configuration, Runtime-owned durable memory, VFS backend integration.
- `bundles`: immutable Runtime bundle versions, prompt document loading, overlay resolution.
- `cron`: durable scheduled-trigger primitive and fire ledger.
- `heartbeat`: interval/liveness-trigger primitive, silent outcome handling, capture-session awareness.
- `internal`: private Control Plane calls such as `POST /internal/sessions/start`.

Shared package dependencies:

- `packages/protocol`: only source of truth for client to Runtime WebSocket events.
- `packages/api-contract`: only source of truth for Control Plane to Runtime HTTP schemas.
- `packages/providers`: only approved path for auth, telemetry, feature flags, and connector clients.
- `packages/domain-types`: shared domain shapes that are not tied to one wire format.

## Architectural Invariants

Within each domain, code depends only forward through:

```text
types -> config -> repo -> service -> runtime -> ui
```

Layer meanings:

- `types`: schemas and TypeScript types only.
- `config`: environment parsing and typed settings.
- `repo`: durable storage and external persistence access.
- `service`: domain logic and orchestration; no direct I/O.
- `runtime`: process wiring, handlers, timers, queues, sockets.
- `ui`: user-facing or protocol-facing adapter layer. In this service, WebSocket and HTTP handlers live here.

Hard invariants:

- Scope Runtime state by `user_id`; `tenant_id` does not exist in v1.
- Keep one logical Agent Instance per User in v1.
- Accept public client traffic only through the WebSocket Protocol.
- Accept only `connect` before WebSocket handshake succeeds.
- Verify client JWTs locally through `packages/providers`; do not call the Control Plane to authenticate client sockets.
- Keep the Control Plane out of the client message data path.
- Store Conversation History as Runtime-owned server truth in Neon.
- Treat Cron and Heartbeat as triggers, not notifications.
- Make Post-Message-Back the only Runtime primitive that can cause push notification handoff.
- Keep APNs/FCM credentials and device-token routing in the Control Plane.
- Do not implement a standalone `channels` domain for Mobile, Desktop, or Android v1 clients.
- Do not reimplement DeepAgents planning, tool loop, VFS semantics, skills, subagents, memory surface, or compaction in shell code.
- Materialize host files only when a concrete backend/tool requires OS-level files.

Mechanical checks should enforce:

- Layer direction inside `src/domains/**`.
- No cross-deployable imports from `apps/**` or other `services/**`.
- Provider-only access for auth, telemetry, feature flags, Neon clients, and Control Plane clients.
- Protocol consistency through `packages/protocol`.
- Forbidden vocabulary from `../../docs/CONTEXT.md` avoid lists.

## Boundaries

Client boundary:

- Mobile, Desktop, and future Android connect directly to the Runtime over WebSocket after receiving Routing from the Control Plane.
- Mobile sends `user_message` and renders Conversation History.
- Desktop is capture-only and sends `context_snapshot` plus `session_end_marker`.
- Client-specific behavior is represented by Protocol events and `client_kind`, not by channel adapters.

Control Plane boundary:

- Control Plane owns identity, gates, devices, Routing issuance, Agent Instance registry, and push credentials.
- Runtime exposes private internal HTTP only for server-to-server calls such as `POST /internal/sessions/start`.
- Runtime calls Control Plane notification endpoints only from Post-Message-Back flow.

DeepAgents boundary:

- Runtime shell invokes DeepAgents per ordered Runtime event.
- DeepAgents receives session context, bundle version, memory/VFS backend, and registered tools.
- DeepAgents output is a candidate result; shell classifies it as silent, normal reply, or Post-Message-Back.

Neon boundary:

- Runtime uses its own Neon schema and Postgres role, separate from Control Plane auth/lifecycle tables.
- Runtime owns Conversation History, Runtime events, Runtime turns, checkpoints, bundle versions, VFS overlay documents, Cron records, Heartbeat state, and Post-Message-Back records.
- User-owned Runtime rows are keyed by `user_id`.

Bundle and VFS boundary:

- Bundle documents are immutable versioned defaults.
- User overlays are mutable documents keyed by `user_id` and path.
- Reads resolve overlay first, pinned bundle default second.
- Writes must pass path policy; immutable bundle defaults are not mutated in place.

Deployment boundary:

- Runtime deploys to GCE because it is always-alive and owns long-running loops.
- Do not move this service to Cloud Run, Lambda, or another stateless platform without a replacement for resident queues, schedulers, sockets, and liveness.

## Cross-cutting Concerns

Providers:

- Auth, telemetry, feature flags, Neon clients, model provider clients, and Control Plane clients enter through explicit provider interfaces.
- Domain code should depend on provider interfaces, not concrete SDK setup.

Observability:

- Log connection lifecycle, handshake failures, event enqueue/dequeue, Runtime turns, DeepAgents invocations, VFS access, Cron fires, Heartbeat ticks, and Post-Message-Back handoffs.
- Record trace/run IDs at Runtime turn boundaries.
- Redact auth tokens, conversation bodies, memory contents, and Context Snapshot content by default.

Reliability:

- Persist events before processing when side effects matter.
- Make inbound `message_id` and `snapshot_id` idempotent.
- Reconnect recovery is snapshot-first; live stream is at-most-once in v1.
- Scheduler loops must not block the WebSocket gateway event loop.

Security:

- Public WebSocket auth uses Neon Auth JWT verification via shared Providers.
- Internal HTTP uses shared-secret auth on a private network path.
- Runtime never handles APNs credentials directly.
- Cross-user data leakage is a critical bug; tests must cover user isolation for repos and queues.

Testing:

- Unit-test service logic with repo/provider fakes.
- Integration-test handshake, reconnect snapshot, idempotency, multi-user isolation, Cron fire, Heartbeat silent outcome, and Post-Message-Back handoff.
- Keep DeepAgents faked in shell tests unless the test is explicitly an integration test of DeepAgents wiring.
