# Agent Runtime Architecture

This document is the deployable-local architecture contract for `services/agent-runtime/`. It extends the monorepo-wide rules in [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md); it does not replace them. For vocabulary, read [`CONTEXT.md`](CONTEXT.md) (Agent Runtime: Agent Runtime, Agent Instance, Desktop Coaching Window, Opening Orientation, Post-Message-Back, Cron, Heartbeat, Monitoring Turn, Interactive Turn, Runtime Turn, Persistence Adapter, Procedure Floor, Pinned Bundle Version, Per-User Memory, Sensory Buffer, Session Snapshot, History Backfill) and the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md) (context map + shared product language) first.

## Bird's-eye Overview

The **Agent Runtime** is the always-alive, multi-tenant service that runs **Companion** behavior. It deploys as one Node/TypeScript process on GCE and serves many Users, with one logical **Agent Instance** per `user_id`.

DeepAgents is the brain. The Intentive Runtime shell is the product boundary around that brain.

```text
Mobile Client                 Desktop Client
  user_message                  perception_event/session_end_marker
  connect (+ client_tz)         connect (+ client_tz)
       \                              /
        \-------- WebSocket Protocol-/
                       |
                    gateway
             auth, connect, post-connect routing
                       |
         +-------------+-------------+
         |                           |
  Per-User Channel (sessions)   cron / active-window heartbeat
  txn ingress + queue reads     committed / best-effort enqueue
         |                                  |
  coaching lifecycle + fixed evidence reader
  active socket attestation + 120 s floor
         |                                  |
  runtime (Turn Execution spine)   cron_runs (+ spine runtime_turns)
  floor + DeepAgents + one anchor         |
         +-------------+-------------+
                       |
       delivery + conversation + checkpoints
                 Neon Runtime schema
                       |
       companion_message / Post-Message-Back
```

DeepAgents owns planning, tool execution, VFS semantics, skills, memory surface, subagents, and compaction. The Intentive shell owns WebSocket ingress, user isolation, event ordering, Coaching Window projection and attestation, evidence cursoring, Cron, Heartbeat, Post-Message-Back, Control Plane handoff, Neon persistence policy, and deployment liveness.

OpenClaw/Hermes patterns are the local reference source for shell behavior. Start at `reference/AGENTS.md`, then load the relevant `reference/topics/*.md` card before reading raw `reference/openclaw/*-llms.txt` packs. Do not port upstream code verbatim.

## Codemap

`AGENTS.md`
: Agent-facing deployable guide. Read it before changing this service.

`CONTEXT.md`
: Agent Runtime vocabulary: Agent Runtime, Agent Instance, Desktop Coaching Window, Opening Orientation, Post-Message-Back, Cron, Heartbeat, Monitoring Turn, Interactive Turn, Turn Execution, Runtime Turn, Persistence Adapter, Procedure Floor, Pinned Bundle Version, Per-User Memory, Sensory Buffer, Session Snapshot, History Backfill. Read alongside the root `CONTEXT-MAP.md`.

`README.md`
: Operator/developer entrypoint for the deployable.

`ARCHITECTURE.md`
: This file. Runtime-local architecture contract and map.

`docs/plans/agent-runtime-v1-implementation-plan.md`
: Deployable-local phased implementation plan for the v1 Runtime.

`reference/`
: Read-only OpenClaw/Hermes pattern library. Topic cards explain what to borrow and what to leave to DeepAgents.

`src/config/env.ts`
: Boot-time configuration seam (`loadConfig`, `AgentRuntimeConfig`). Validates shape only; optional Langfuse and Sentry settings (`LANGFUSE_MODE`, `SENTRY_MODE`); domains receive typed slices and must not re-parse `process.env`.

`src/index.ts`
: Workspace library entry — re-exports `loadConfig` and testable public surfaces for consumers and tests.

`src/main.ts`
: Composition root — loads config, bootstraps observability (`bootstrapObservability` from `@intentive/providers/observability`), constructs Providers, wires Neon-backed Agent Instance (including `client_tz` and durable Bootstrap Lifecycle state), event-ledger, conversation, Coaching Window, current perception, and fixed coaching-evidence repos, delivery port, Control Plane push client, connection registry, Procedure Floor resolver + memory/`cron` CompositeBackend + DeepAgents adapter, one working-context assembler, and one **Turn Execution** spine shared by the **Interactive Turn**, Opening Orientation, Cron, and **Monitoring Turn** runners. It constructs the **Per-User Channel** (transactional ingress + pinned floor + lifecycle hooks + `runTurn` + queue-serialized snapshot reads), the `MonitoringCoordinator`, perception embedding enrichment outside that turn lane, the Cron scheduler, active-window Heartbeat scheduler, private Internal API, public WebSocket gateway, and `SIGTERM`/`SIGINT` lightweight drain.

`Dockerfile`
: Production container image for GCE deploy — `pnpm deploy` of `@intentive/agent-runtime` and `scripts/boot-fetch-secrets.mjs dist/main.js` entrypoint, so the VM service account can fetch the allowlisted Secret Manager values before booting the runtime.

`src/domains/delivery/service/delivery-port.ts`
: Service-owned shared delivery port. Hides live stream vs Control Plane push branching and records every attempt in `deliveries`.

`src/domains/delivery/service/post-message-back.ts`
: Service-owned Post-Message-Back primitive. Persists a `conversation_messages(via_post_message_back = true)` row before calling the delivery port in proactive mode.

`src/domains/gateway/runtime/connection-registry.ts`
: Gateway-owned process-local connection registry. Tracks live sockets by user,
`client_kind`, capability, foreground state, and Coaching Window presence
attestation. Disconnect removes the attestation. The delivery port consumes the
registry through a narrow send interface.

`src/domains/bundles/service/procedure-floor-resolver.ts`
: Service-owned Procedure Floor resolution — requires the canonical
`intentive-runtime-bundle` `production` prompt, fails closed when fetch or
bundle validation fails, and pins the resolved floor
once per connection.

`src/domains/bundles/service/assemble-system-prompt.ts`
: Trigger-aware system-prompt assembly from the pinned Procedure Floor +
injected `USER.md` + optional `RECENT_PERCEPTION`. Coaching behavior lives in
`AGENTS`; Monitoring Turns additionally receive `HEARTBEAT`. Coaching evidence is a fixed,
window-scoped batch; other trigger families currently omit perception from
their assembled prompt.

`src/domains/coaching/runtime/monitoring-coordinator.ts`
: Sole Runtime coordinator for Coaching Window lifecycle, active Desktop socket
attestation, Opening Orientation admission, 120-second judgment/trailing floors,
burst collapse, fixed evidence reads, successful cursor advancement, and
stale-window revalidation. Opening completion and the first judgment floor are
anchored to the Desktop's presentation acknowledgement, not Client clock time.

`src/domains/coaching/service/opening-orientation.ts`
: Committed Opening Orientation runner. Claims one stable
`opening:<window_id>` identity, retries model failure without creating another
visible message, starts unfinished Bootstrap Lifecycle state in the same commit,
revalidates the window before commit and delivery, and routes only to the
matching actively attested Desktop.

`src/domains/sessions/repo/bootstrap-lifecycle.ts`
: Narrow durable Bootstrap Lifecycle adapter over the Agent Instance row. It
reads `pending | in_progress | completed` and builds guarded transition queries.

`src/domains/sessions/service/bootstrap-lifecycle.ts`
: Bootstrap policy boundary. It prepares Opening Orientation and eligible
window-bound Desktop Interactive Turns with their `firstRun` value and deferred
success transition, keeping status rules out of trigger runners.

`src/domains/coaching/repo/recent-evidence.ts`
: Privacy-safe coaching evidence reader. Fixes an upper cursor, reads the oldest
unconsumed records for one user/window, caps at 32 events and 12,000 rendered
characters, and versions the exact rendered current projection with cursor bounds
plus a SHA-256 digest. Commit-time rerendering makes expiry, tombstones, and
redaction re-emits authoritative even when they occur during model execution.

`src/domains/memory/repo/memory-backend.ts`
: Repo-owned DeepAgents `CompositeBackend` route map: `/memories/` uses `StoreBackend` over Neon, and `/crons/` can mount the Cron backend.

`src/domains/cron/repo/cron-backend.ts`
: Repo-owned `/crons/` DeepAgents backend. Presents markdown cron cards to built-in filesystem tools while persisting rows in `cron_jobs`.

`src/domains/heartbeat/repo/heartbeat-schedule.ts`
: Repo-owned computed due-user projection over `agent_instances` and latest `runtime_turns`; no heartbeat table.

`src/domains/heartbeat/runtime/heartbeat-scheduler.ts`
: Runtime-owned poll loop mirroring Cron scheduler error containment; enqueues due users into the Per-User Channel best-effort lane.

`src/domains/runtime/repo/deep-agents-adapter.ts`
: Repo-owned DeepAgents + LangGraph Postgres checkpoint adapter (`createDeepAgentsAdapter`).

`src/domains/runtime/service/working-context.ts`
: Service-owned context assembler for what the model sees: Procedure Floor
supplied by the caller plus `USER.md` and optional caller-fixed, privacy-safe
recent perception.

`src/domains/runtime/service/turn.ts`
: Service-owned **Turn Execution** spine (ADR-0031): resolve `floor()`, assemble working context, invoke DeepAgents, then in one transaction append the caller's trigger-specific rows plus exactly one `runtime_turns` anchor (ok or failed).

`src/domains/runtime/service/turn-runner.ts`
: Thin **Interactive Turn** execution builder over `turn.ts` — stable main thread, companion-message append, persisted-then-delivered reply, and rethrow-on-failure policy; the spine writes the **Runtime Turn** anchor.

`src/domains/runtime/service/monitoring-turn.ts`
: Thin **Monitoring Turn** execution builder over `turn.ts` — stable main
thread, `heartbeat` / `perception_event` triggers, fixed Coaching Window
evidence, silent-by-default egress via internally bound
`post_message_back`; the spine writes the **Runtime Turn** anchor and advances
the evidence cursor only on success.

`src/domains/runtime/repo/runtime-turns.ts`
: Durable `runtime_turns` insert queries for observability/eval anchoring.

`src/domains/perception/repo/perception-records.ts`
: Repo-owned searchable projection of `perception_event` rows for Screen Memory lookup (`perception_records`). Reconciliation invalidates an old vector atomically when embedding-relevant content changes; exact duplicates preserve it. Asynchronous embedding writes compare against the exact projected content and signals used to compute them.

`src/domains/perception/service/perception-ingress-hooks.ts`
: Separates perception-triggered Monitoring Turn enqueue from out-of-lane embedding enrichment, so optional vector work cannot consume the Per-User Channel's one collapsible Monitoring Turn slot.

`src/domains/perception/service/search-screen-context.ts`
: Service-owned DeepAgents tool surface for older Screen Memory lookup (`search_screen_context`).

`migrations/`
: Runtime-owned Neon schema migrations (`agent_runtime.*`). See `migrations/README.md`.

Domain layout (lazy — folders appear with each vertical slice, ADR-0002):

```text
src/domains/
  gateway/{types,config,repo,service,runtime,ui}/
  sessions/{types,config,repo,service,runtime,ui}/
  perception/{types,repo,service}/
  conversation/{types,config,repo,service,runtime,ui}/
  protocol/{types,config,repo,service,runtime,ui}/
  runtime/{types,config,repo,service,runtime,ui}/
  memory/{types,config,repo,service,runtime,ui}/
  bundles/{types,config,repo,service,runtime,ui}/
  delivery/{types,config,repo,service,runtime,ui}/
  cron/{types,config,repo,service,runtime,ui}/
  heartbeat/{types,config,repo,service,runtime,ui}/
  coaching/{types,config,repo,service,runtime,ui}/
  internal/{types,config,repo,service,runtime,ui}/
```

This block is the _map_, not a build order. Per [ADR-0002](docs/adr/0002-agent-runtime-vertical-first-progressive-layering.md), domain folders and their layers are created **lazily** — when a phase implements real behavior for that domain — not scaffolded upfront. An empty layer folder hides no design decision and only adds boundaries to read, so the architecture lives in this map plus the layer-direction lint, never in placeholder files. Do not pre-create empty `{types..ui}` trees to "match" this diagram.

Domain responsibilities:

- `gateway`: WebSocket server, handshake-first connect flow, JWT verification, socket lifecycle, post-connect routing for `history_backfill_request`. Protocol-version compatibility is enforced at build time by the single shared `packages/protocol` import (monorepo "one protocol version" rule), **not** negotiated per connection; `client_version` on `connect` is informational, and the `protocol_unsupported` error code is reserved/unused in v1.
- `sessions`: Agent Instance lookup and durable Bootstrap Lifecycle state, the **Per-User Channel** (per-`user_id` queueing, ordering, idempotency, transactional ingress, queue-serialized Conversation History reads, **Interactive Turn** dispatch, and coaching lifecycle/perception hooks), and connected-client presence. Exposes the `BoundSession`, `BootstrapLifecycle`, and `PerUserChannel` types as its public `types/` contract.
- `perception`: expiring, current `perception_records` projection and
  `search_screen_context` tool. Detailed bodies live here, not in the immutable
  event ledger; redaction, tombstone, and expiry updates are authoritative.
- `conversation`: durable `conversation_messages` transcript, `append` writes, and `readSnapshot` Session Snapshot projection (reconnect + backfill reads). Separate from `sessions` by knowledge, not storage family (ADR-0008).
- `protocol`: `packages/protocol` event parsing, inbound-to-command mapping, outbound event construction.
- `runtime`: DeepAgents adapter, **Turn Execution** spine (`turn` + `working-context`; ADR-0031 owns floor resolution, stale-window commit guard, and the single `runtime_turns` anchor per turn), **Interactive Turn** lifecycle (`turn-runner`), **Monitoring Turn** builder (`monitoring-turn`), durable **Runtime Turn** insert queries including trigger/window/evidence metadata, and trace/run IDs.
- `memory`: DeepAgents memory configuration, `StoreBackend` namespace wiring, injected `USER.md` profile reads, and the `/memories/` durable VFS route.
- `bundles`: canonical Langfuse Procedure Floor resolution
  (`intentive-runtime-bundle`, containing `SOUL`, `AGENTS`, `BOOTSTRAP`, and
  `HEARTBEAT`), fail-closed validation, per-connection pinning, and
  trigger-aware prompt assembly.
- `coaching`: default-off founder feature gate, durable window projection,
  fixed privacy-safe evidence reader, one Opening Orientation, and the
  `MonitoringCoordinator`.
- `delivery`: shared delivery port, live connection registry read interface,
  ordinary interactive routing, matching-window Desktop-only proactive routing,
  Post-Message-Back service/tool, and `deliveries` attempt ledger. Coaching
  output never falls back to Control Plane push.
- `cron`: durable scheduled-trigger primitive, `/crons/` filesystem-card backend, poll scheduler, committed Per-User Channel enqueue, fire ledger, and main-thread cron-turn lifecycle.
- `heartbeat`: active-window trailing-floor trigger over `coaching_windows`,
  computed due-user scheduler, and best-effort Per-User Channel enqueue; no
  separate heartbeat table.
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
- Keep push delivery and device push-token routing in the Control Plane.
- Project valid Coaching Window lifecycle events even while the coaching feature
  is disabled; gate only Opening/Monitoring model work and proactive delivery.
- Gate every Coaching Turn on one durable active window plus a connected,
  actively attested Desktop socket advertising `desktop_coaching_v1`.
- Revalidate the same window before committing or delivering coaching output.
- Never route Coaching Window output to Mobile, push notification, or Control
  Plane push.
- Keep detailed perception bodies in expiring `perception_records`; new
  `runtime_events` rows retain only dedupe and ordering metadata.
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
- Desktop sends Rewind `perception_event`, Coaching Window lifecycle/presence,
  and `session_end_marker`, and can also send Floating Bar `user_message` into
  the shared Conversation History. New Desktop perception requires
  `window_id`; legacy queued events without one remain accepted but never enter
  Coaching Turns.
- Client-specific behavior is represented by Protocol events and `client_kind`, not by channel adapters.
- Reconnect Session Snapshots remain wire-compatible and never replay a
  Floating Bar effect. Live coaching messages include `window_id`; ordinary
  replies keep their current shape.

Control Plane boundary:

- Control Plane owns identity, gates, devices, Routing issuance, Agent Instance registry, and push delivery.
- Runtime exposes private internal HTTP only for server-to-server calls such as `POST /internal/sessions/start`.
- Runtime calls Control Plane notification endpoints only from Post-Message-Back flow.

DeepAgents boundary:

- Runtime shell invokes DeepAgents per ordered trigger on the **Per-User Channel** for main-checkpoint turns; Cron and Opening Orientation are committed work, while Heartbeat and perception-triggered Monitoring Turns are best-effort/collapsible work.
- DeepAgents receives session context, pinned Procedure Floor, memory/VFS
  backend, registered tools, and either legacy recent perception or a fixed
  Coaching Window evidence batch. The model never receives shell arguments for
  window identity, evidence version, mode, or drift classification.
- Trigger type sets egress default (ADR-0013): an **Interactive Turn** delivers the agent's returned final message as the reply; proactive turns stay silent unless the agent calls **Post-Message-Back**. Ingress ack is decoupled from turn success (ADR-0020).

Neon boundary:

- Runtime uses its own Neon schema and Postgres role, separate from Control Plane auth/lifecycle tables.
- Runtime owns Agent Instance Bootstrap Lifecycle state, Conversation History, Runtime events, Runtime turns,
  `coaching_windows`, checkpoints, Procedure Floor version pins, Per-User Memory
  store rows, Cron records, and delivery records. Heartbeat stores no dedicated
  state.
- User-owned Runtime rows are keyed by `user_id`.
- `coaching_windows` allows at most one active row per user. A new start
  idempotently supersedes any stale active row; duplicate starts/ends are
  harmless. Opening identity is stable as `opening:<window_id>`; intervention
  identities use the reserved `intervention:` prefix. User-authored message IDs
  cannot use either Runtime-owned namespace.
- `agent_instances.bootstrap_status` is the only first-run truth. Session Start
  leaves it pending; Opening Orientation starts it; a successful Interactive
  Turn completes it. Conversation history and memory-file existence are not
  lifecycle signals.

Procedure Floor and memory boundary:

- The Procedure Floor (`SOUL`, `AGENTS`, `BOOTSTRAP`, `HEARTBEAT`) is immutable
  product content held in one Langfuse `intentive-runtime-bundle`, resolved by
  label, validated, pinned once per connection, and injected into each turn's
  prompt. Coaching behavior is part of `AGENTS`; Monitoring Turns additionally
  receive `HEARTBEAT`; unfinished Bootstrap Lifecycle turns receive
  `BOOTSTRAP`.
- Langfuse is required: missing configuration, a failed fetch, an unavailable
  label, or a malformed bundle fails startup or connection resolution. There is
  no deploy-owned prompt substitute.
- Per-User Memory is separate from the Procedure Floor: `USER.md` is read from
  the user's StoreBackend namespace and injected; `/memories/` is exposed to
  DeepAgents VFS tools for on-demand reads/writes. Coaching policy permits only
  abstracted preferences, recurring obstacles, and interventions the user
  confirms as useful. Detailed OCR/audio evidence must not be copied into
  Conversation History or durable memory.
- Perception is separate from both memory and the Procedure Floor. Coaching
  reads oldest-unconsumed current records from one window, after fixing an upper
  cursor, capped at 32 events and 12,000 rendered characters. A failed turn does
  not advance the cursor.
- Procedure Floor documents are never routed into the agent's filesystem, so immutability is structural rather than a write-rejection policy.

Deployment boundary (ADR-0032):

- Runtime deploys to GCE because it is always-alive and owns long-running loops.
- Do not move this service to Cloud Run, Lambda, or another stateless platform without a replacement for resident queues, schedulers, sockets, and liveness.
- **One VM, no horizontal scaling in v1.** The connection registry is process-local and both VMs would independently run the Cron + Heartbeat poll loops, double-firing every user. HA must first solve scheduler leader-election; do not "add instances" for reliability.
- **TLS front door:** an External HTTPS Load Balancer (Google-managed cert) terminates `wss://` and forwards plain `ws` to `:8080`; the VM firewall accepts `:8080` only from load-balancer ranges. The LB backend timeout is high because there is no app-level WebSocket keepalive ping.
- **Secrets** are fetched from Secret Manager at boot by a dedicated VM service account — never stored in instance metadata.
- **Deploys are in-place image swaps** with a lightweight `SIGTERM` drain (stop schedulers → clean-close sockets → flush telemetry → exit); in-flight turns are not drained (durable execution + idempotent ingress + snapshot-first reconnect make a mid-turn kill safe). Every deploy is a brief rolling reconnect, not blue-green; rollback is re-deploying the previous image SHA.
- **Crash recovery** is konlet container-restart + GCE host auto-restart; a hung process is surfaced by Sentry (ADR-0030) and fixed reactively — no autohealing or uptime-alert pipeline in v1.
- **Neon connection is direct (non-pooled):** one always-alive process with LangGraph `PostgresStore`/`PostgresSaver` (persistent connections + prepared statements) that conflict with PgBouncer pooling — the opposite of the Control Plane's pooled choice.

## Cross-cutting Concerns

Providers:

- Auth, telemetry, feature flags, Neon clients, model provider clients, and Control Plane clients enter through explicit provider interfaces.
- Domain code should depend on provider interfaces, not concrete SDK setup.

Observability (ADR-0030):

- Three layers, not a custom metrics program: **Langfuse** (behavior/eval — model I/O, procedure floor), **Sentry** (errors/crashes — optional via `SENTRY_DSN`), **structured logs at domain seams** (connection, queue, turn, Coaching Window, VFS, Cron, Heartbeat, delivery handoff).
- `main.ts` calls `bootstrapObservability` once; domain code uses `observability.createLogger` and must not import `@sentry/node` or instantiate Langfuse tracing directly.
- Log connection lifecycle, handshake failures, event enqueue/dequeue, Runtime
  turns, DeepAgents invocations, VFS access, Cron fires, Heartbeat ticks,
  lifecycle duration, orientation delivery, evidence-to-turn latency,
  interventions shown, reply latency, model usage/cost, and
  Post-Message-Back handoffs.
- Record trace/run IDs at Runtime turn boundaries.
- Redact auth tokens, conversation bodies, memory contents, and Perception Event
  content by default (allowlisted log attrs only). Active hours are diagnostic,
  not an optimization target.

Reliability:

- Persist events before processing when side effects matter.
- Make inbound `message_id` and `event_id` idempotent.
- Reconnect recovery is snapshot-first; live stream is at-most-once in v1.
- Scheduler loops must not block the WebSocket gateway event loop.

Security:

- Public WebSocket auth uses Neon Auth JWT verification via shared Providers.
- Internal HTTP (Session Start) uses shared-secret auth on **public ingress via the load balancer's `/internal` path**, not a private network path (ADR-0033). The bearer secret is the only guard; blast radius of a leak is a junk session row.
- Runtime never handles push-provider credentials directly.
- Cross-user data leakage is a critical bug; tests must cover user isolation for repos and queues.

Testing:

- **Config tier:** `test/config-env.test.mjs` pins `loadConfig` grouping, defaults, and safe error keys.
- **Service tier:** unit-test domain logic with repo/provider fakes as each vertical slice ships; #25 covers Session Start idempotency and gateway auth/protocol errors; #28 covers per-user queue ordering/isolation and ingest idempotency.
- **Repo tier:** `#28` exercises real SQL on ephemeral Neon branches when `NEON_API_KEY` and `NEON_PROJECT_ID` are set (`test/sessions-repo.integration.test.mjs`, `test/helpers/neon-branch.mjs`); otherwise those tests skip.
- **Integration tier:** use transport adapters where they prove real boundaries;
  existing suites cover Hono/WS ingress, snapshots/backfill, Interactive Turns,
  Procedure Floor pinning, memory, perception projection,
  Cron, delivery, Post-Message-Back, heartbeat, queue arbitration, isolation, and
  restart. Coaching coverage additionally proves lifecycle idempotency, one
  active window, disconnect/lock gating, one visible orientation across retry,
  stale-window suppression, tenant isolation, fixed-cursor correctness for
  mid-turn arrivals, redaction/tombstone/expiry behavior, metadata-only ledger
  writes, and absence of Mobile/push coaching delivery.
- Keep DeepAgents faked in shell tests unless the test is explicitly an integration test of DeepAgents wiring.
