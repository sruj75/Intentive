# Agent Runtime Architecture

This document is the deployable-local architecture contract for `services/agent-runtime/`. It extends the monorepo-wide rules in [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md); it does not replace them. For vocabulary, read [`CONTEXT.md`](CONTEXT.md) (Agent Runtime: Agent Runtime, Agent Instance, Post-Message-Back, Cron, Heartbeat, Interactive Turn, Runtime Turn, Persistence Adapter, Procedure Floor, Pinned Bundle Version, Per-User Memory, Session Snapshot, History Backfill) and the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md) (context map + shared product language) first.

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
             auth, connect, post-connect routing
                       |
              Per-User Channel (sessions)
     txn ingress + queue-serialized reads
                       |
              runtime (Interactive Turn)
           DeepAgents invoke + runtime_turns
                       |
              conversation + checkpoints
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
: Agent Runtime vocabulary: Agent Runtime, Agent Instance, Post-Message-Back, Cron, Heartbeat, Interactive Turn, Runtime Turn, Persistence Adapter, Procedure Floor, Pinned Bundle Version, Per-User Memory, Session Snapshot, History Backfill. Read alongside the root `CONTEXT-MAP.md`.

`README.md`
: Operator/developer entrypoint for the deployable.

`ARCHITECTURE.md`
: This file. Runtime-local architecture contract and map.

`docs/plans/agent-runtime-v1-implementation-plan.md`
: Deployable-local phased implementation plan for the v1 Runtime.

`reference/`
: Read-only OpenClaw/Hermes pattern library. Topic cards explain what to borrow and what to leave to DeepAgents.

`src/config/env.ts`
: Boot-time configuration seam (`loadConfig`, `AgentRuntimeConfig`). Validates shape only; domains receive typed slices and must not re-parse `process.env`.

`src/index.ts`
: Workspace library entry — re-exports `loadConfig` and testable public surfaces for consumers and tests.

`src/main.ts`
: Composition root — loads config, constructs Providers, wires Neon-backed Agent Instance, event-ledger, and conversation repos, constructs Procedure Floor resolver + memory backend + DeepAgents adapter and **Interactive Turn** runner, constructs the **Per-User Channel** (transactional ingress + pinned floor + `runTurn` + queue-serialized snapshot reads), serves the private Internal API, and attaches the public WebSocket gateway.

`src/domains/bundles/service/procedure-floor-resolver.ts`
: Service-owned Procedure Floor resolution — Langfuse fetch when configured, deploy-bundled fallback otherwise; pins floor once per connection.

`src/domains/bundles/service/assemble-system-prompt.ts`
: Trigger-aware system-prompt assembly from the pinned Procedure Floor + injected `USER.md`.

`src/domains/memory/repo/memory-backend.ts`
: Repo-owned DeepAgents `CompositeBackend` / `StoreBackend` wiring over Neon, namespaced by `user_id`.

`src/domains/runtime/repo/deep-agents-adapter.ts`
: Repo-owned DeepAgents + LangGraph Postgres checkpoint adapter (`createDeepAgentsAdapter`).

`src/domains/runtime/service/turn-runner.ts`
: Service-owned **Interactive Turn** orchestration — invoke model, dual-write companion message + **Runtime Turn** record.

`src/domains/runtime/repo/runtime-turns.ts`
: Durable `runtime_turns` insert queries for observability/eval anchoring.

`migrations/`
: Runtime-owned Neon schema migrations (`agent_runtime.*`). See `migrations/README.md`.

Domain layout (lazy — folders appear with each vertical slice, ADR-0002):

```text
src/domains/
  gateway/{types,config,repo,service,runtime,ui}/
  sessions/{types,config,repo,service,runtime,ui}/
  conversation/{types,config,repo,service,runtime,ui}/
  protocol/{types,config,repo,service,runtime,ui}/
  runtime/{types,config,repo,service,runtime,ui}/
  memory/{types,config,repo,service,runtime,ui}/
  bundles/{types,config,repo,service,runtime,ui}/
  cron/{types,config,repo,service,runtime,ui}/
  heartbeat/{types,config,repo,service,runtime,ui}/
  internal/{types,config,repo,service,runtime,ui}/
```

This block is the _map_, not a build order. Per [ADR-0002](docs/adr/0002-agent-runtime-vertical-first-progressive-layering.md), domain folders and their layers are created **lazily** — when a phase implements real behavior for that domain — not scaffolded upfront. An empty layer folder hides no design decision and only adds boundaries to read, so the architecture lives in this map plus the layer-direction lint, never in placeholder files. Do not pre-create empty `{types..ui}` trees to "match" this diagram.

Domain responsibilities:

- `gateway`: WebSocket server, handshake-first connect flow, JWT verification, socket lifecycle, post-connect routing for `history_backfill_request`. Protocol-version compatibility is enforced at build time by the single shared `packages/protocol` import (monorepo "one protocol version" rule), **not** negotiated per connection; `client_version` on `connect` is informational, and the `protocol_unsupported` error code is reserved/unused in v1.
- `sessions`: Agent Instance lookup, the **Per-User Channel** (per-`user_id` queueing, ordering, idempotency, transactional ingress, queue-serialized Conversation History reads, and **Interactive Turn** dispatch via injected `runTurn`), connected-client presence. Exposes the `BoundSession` and `PerUserChannel` types as its public `types/` contract.
- `conversation`: durable `conversation_messages` transcript, `append` writes, and `readSnapshot` Session Snapshot projection (reconnect + backfill reads). Separate from `sessions` by knowledge, not storage family (ADR-0008).
- `protocol`: `packages/protocol` event parsing, inbound-to-command mapping, outbound event construction.
- `runtime`: DeepAgents adapter, **Interactive Turn** lifecycle (`turn-runner`), durable **Runtime Turn** records (`runtime_turns`), trace/run IDs. Agent Instance lazy hydration remains ADR-0018 follow-up.
- `memory`: DeepAgents memory configuration, `StoreBackend` namespace wiring, injected `USER.md` profile reads, and the `/memories/` durable VFS route.
- `bundles`: Procedure Floor source resolution, Langfuse prompt handles, deploy-bundled fallback, per-connection pinning, and trigger-aware prompt assembly.
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
- Forbidden vocabulary from `CONTEXT.md` and the root `CONTEXT-MAP.md` avoid lists.

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

- Runtime shell invokes DeepAgents per ordered Runtime event on the **Per-User Channel**.
- DeepAgents receives session context, pinned Procedure Floor, memory/VFS backend, and registered tools.
- Trigger type sets egress default (ADR-0013): an **Interactive Turn** delivers the agent's returned final message as the reply; proactive turns stay silent unless the agent calls **Post-Message-Back**. Ingress ack is decoupled from turn success (ADR-0020).

Neon boundary:

- Runtime uses its own Neon schema and Postgres role, separate from Control Plane auth/lifecycle tables.
- Runtime owns Conversation History, Runtime events, Runtime turns, checkpoints, Procedure Floor version pins, Per-User Memory store rows, Cron records, Heartbeat state, and Post-Message-Back records.
- User-owned Runtime rows are keyed by `user_id`.

Procedure Floor and memory boundary:

- The Procedure Floor (`SOUL`, `AGENTS`, `BOOTSTRAP`, `HEARTBEAT`) is immutable product content resolved by label, pinned once per connection, and injected into each turn's prompt.
- Langfuse is optional: any fetch failure or missing config falls back to the deploy-bundled placeholder floor so the Agent Runtime can still run.
- Per-User Memory is separate from the Procedure Floor: `USER.md` is read from the user's StoreBackend namespace and injected; `/memories/` is exposed to DeepAgents VFS tools for on-demand reads/writes.
- Procedure Floor documents are never routed into the agent's filesystem, so immutability is structural rather than a write-rejection policy.

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

- **Config tier:** `test/config-env.test.mjs` pins `loadConfig` grouping, defaults, and safe error keys.
- **Service tier:** unit-test domain logic with repo/provider fakes as each vertical slice ships; #25 covers Session Start idempotency and gateway auth/protocol errors; #28 covers per-user queue ordering/isolation and ingest idempotency.
- **Repo tier:** `#28` exercises real SQL on ephemeral Neon branches when `NEON_API_KEY` and `NEON_PROJECT_ID` are set (`test/sessions-repo.integration.test.mjs`, `test/helpers/neon-branch.mjs`); otherwise those tests skip.
- **Integration tier:** use transport adapters where they prove real boundaries; #25 covers Hono Internal API request handling and a real WebSocket `hello_ok` smoke path; #28 extends the WebSocket path with bound-session post-handshake delegation; #29 covers reconnect Session Snapshot, `history_backfill_request`/`history_backfill_response`, and transactional ingress projection (`test/runtime-ingress-projection.integration.test.mjs`); #36 covers **Interactive Turn** end-to-end (companion reply + `runtime_turns`, turn-failure containment, checkpoint rehydration in `test/runtime-adapter.integration.test.mjs`); #37 covers Procedure Floor pinning at connect, `USER.md` injection, memory backend wiring, and `bundle_version` on successful turns. Future slices add Cron fire, Heartbeat silent outcome, and Post-Message-Back handoff.
- Keep DeepAgents faked in shell tests unless the test is explicitly an integration test of DeepAgents wiring.
