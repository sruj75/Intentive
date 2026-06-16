# Changelog

All notable changes to the Agent Runtime service. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this service will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Added

- **Heartbeat + Post-Message-Back delivery + Cron main-session flip** (ADR-0027/0028/0029) —
  `delivery/` domain with shared `DeliveryPort`, `deliveries` ledger
  (`migrations/0009_deliveries.sql`), Control Plane push handoff client,
  `post_message_back({ body })` tool, and process-local gateway connection
  registry. **Interactive Turn** replies are now persisted and then streamed
  through the shared delivery port; proactive output persists first via
  Post-Message-Back and streams to foreground chat clients or pushes through the
  Control Plane. **Cron** now enqueues onto the **Per-User Channel** committed
  lane and runs on the user's main thread (`threadId = userId`). **Heartbeat**
  adds a zero-state computed scheduler over `agent_instances` + `runtime_turns`
  that enqueues best-effort **Monitoring Turns**. Tests:
  `test/delivery-port.test.mjs`, `test/deliveries.integration.test.mjs`,
  `test/connection-registry.test.mjs`, `test/cp-push-client.test.mjs`,
  `test/post-message-back.test.mjs`, `test/monitoring-turn.test.mjs`,
  `test/heartbeat-scheduler.test.mjs`,
  `test/heartbeat-schedule.integration.test.mjs`, plus extended queue, router,
  cron, and turn-runner coverage.
- **Cron scheduler, filesystem cards, and ephemeral fire turns** ([Issue #39]) —
  `cron/` domain slice: `/crons/` DeepAgents backend over `cron_jobs`, `croner`
  schedule validation (5-minute minimum interval), poll-loop scheduler
  (`next_fire_at <= now()`), silent ephemeral-thread fire handler with
  `cron_runs` ledger and transient-error retry. Connect persists optional
  `client_tz` on the Agent Instance row for offline wall-clock resolution
  (ADR-0025). Migrations `migrations/0006_cron_jobs.sql`,
  `migrations/0007_cron_runs.sql`, `migrations/0008_agent_instances_client_tz.sql`.
  `memory/` `CompositeBackend` mounts the cron route alongside `/memories/`.
  Tests: `test/cron-backend.test.mjs`, `test/cron-card.test.mjs`,
  `test/cron-schedule.test.mjs`, `test/cron-scheduler.test.mjs`,
  `test/cron-turn.test.mjs`, plus extended `test/connect-handler.test.mjs`,
  `test/per-user-channel.test.mjs`, and `test/session-start.test.mjs`.
- **Sensory Buffer and perception injection** ([Issue #38]) — `sessions/` adds a
  `SensoryBufferReader` read projection over `runtime_events` for the most
  recent `context_snapshot` or `session_end_marker`, with no new table or
  migration. **Interactive Turn** prompt assembly now receives the single most
  recent perception fact via `RECENT_PERCEPTION`, and the **Per-User Channel**
  raises a no-op `PerceptionArrivedSink` only for newly inserted perception
  events. Tests: `test/sensory-buffer.integration.test.mjs`, plus extended
  prompt, turn-runner, adapter, and channel coverage.
- **Procedure Floor, native Per-User Memory, and `bundle_version`** ([Issue #37]) —
  `bundles/` domain slice for deploy-bundled fallback prompts, Langfuse Prompt
  Management source, fallback resolver, and trigger-aware prompt assembly;
  `memory/` domain slice for DeepAgents `CompositeBackend` / `StoreBackend`
  wiring and `USER.md` profile reads. Connect pins the Procedure Floor once at
  `hello_ok`; `BoundSession` carries it; `runTurn` injects `USER.md`; the
  DeepAgents adapter passes `user_id`, `trigger`, store/backend, optional
  Langfuse callback metadata, and returns `bundleVersion`. Migration
  `migrations/0004_runtime_turns_bundle_version.sql` adds nullable
  `runtime_turns.bundle_version`, now written on successful turns. Tests:
  `test/bundled-fallback.test.mjs`, `test/assemble-system-prompt.test.mjs`,
  `test/procedure-floor-resolver.test.mjs`, `test/langfuse-floor-source.test.mjs`,
  `test/memory-backend.test.mjs`, plus extended connect/turn/runtime coverage.
- **DeepAgents Interactive Turn** ([Issue #36]) — `runtime/` domain slice:
  `createDeepAgentsAdapter` (DeepAgents + LangGraph Postgres checkpoint),
  `createTurnRunner` (invoke → companion append + `runtime_turns` in one
  transaction), and `createRuntimeTurnsRepo`; migration
  `migrations/0003_runtime_turns.sql`. The **Per-User Channel** accepts an
  optional `runTurn` hook: after a new `user_message` ingress commit it runs an
  **Interactive Turn** whose returned final message is persisted as
  `companion_message` (ADR-0013). Turn failures are contained inside the lane
  and recorded as `runtime_turns(status = failed)` without rejecting ingress
  ack (ADR-0020). `src/main.ts` wires OpenRouter model settings from
  `loadConfig.model`. Tests: `test/turn-runner.test.mjs`,
  `test/runtime-adapter.integration.test.mjs`, extended
  `test/per-user-channel.test.mjs` and
  `test/runtime-ingress-projection.integration.test.mjs`.
- **Conversation History, reconnect snapshot, and history backfill** ([Issue #29]) —
  dedicated `conversation` domain (ADR-0008) with Neon-backed `conversation_messages`,
  `append` / `readSnapshot` projection, and migration `migrations/0002_conversation.sql`.
  Connect returns the authoritative Session Snapshot in `hello_ok`; post-connect accepts
  `history_backfill_request` and replies with `history_backfill_response` (ADR-0006
  amended). `packages/protocol` exports the new wire events. User-authored ingress
  (`user_message`) is transactionally projected into Conversation History together with
  the `runtime_events` idempotency marker (ADR-0009); snapshot/backfill reads serialize
  behind the per-`user_id` queue. Companion-message persistence and live outbound
  delivery remain deferred to #36 and #41. Tests: `test/conversation-repo.integration.test.mjs`,
  `test/project-ingress.test.mjs`, `test/post-connect-router.test.mjs`,
  `test/runtime-ingress-projection.integration.test.mjs`, plus extended connect/ws-handler
  coverage (snapshot-reader coverage later consolidated into `test/per-user-channel.test.mjs`).
- **Sessions, ordering, and event ledger** ([Issue #28], in progress) — Neon-backed
  Agent Instance registry (`agent_instances`), append-only `runtime_events` idempotency
  ledger, per-`user_id` in-memory queue, and write-ahead ingest wiring
  (`createRuntimeIngressHandler`: `recordIfNew` before queue submit) for post-connect
  WebSocket ingress through a stub processor. Session Start records
  `{ user_id, auth_subject }`; connect resolves JWT `sub` to the internal `user_id` and
  binds `{ userId, clientKind, agentInstanceId }` for post-handshake handlers (connect
  does not mint Agent Instances from the token alone). Migration
  `migrations/0001_sessions.sql`; repo integration tests use ephemeral Neon branches when
  `NEON_API_KEY` and `NEON_PROJECT_ID` are set. Recorded in
  [ADR-0007](docs/adr/0007-agent-runtime-event-ledger-and-in-memory-ordering.md) and the
  "Runtime durable state is three separate concerns" decision in `CONTEXT.md`. Tests:
  `test/user-queue.test.mjs`, `test/sessions-repo.integration.test.mjs` (ingest/event-handler
  coverage later consolidated into `test/per-user-channel.test.mjs`).
- **Runtime config seam** ([Issue #24], [PR #62]) — `src/config/env.ts` (`loadConfig`,
  `AgentRuntimeConfig`, `AgentRuntimeConfigError`): single boot-time Zod validation for
  `PORT`, `PUBLIC_WS_URL`, `INTERNAL_SECRET_FROM_CONTROL_PLANE`, Neon connection +
  role, and Neon Auth JWKS settings. Re-exported from `src/index.ts`. Tests:
  `test/config-env.test.mjs`.
- **Connection control plane** ([Issue #25], [PR #62]) — public WebSocket `connect`
  handshake, private `POST /internal/sessions/start`, and `src/main.ts` composition root.
  The internal API uses `Authorization: Bearer <secret>`; the successful handshake
  returns `hello_ok` with a Session Snapshot (empty until #29 Conversation History
  projection). Tests cover Session Start idempotency, Internal API auth/body rejection
  with no side effects, structured gateway errors, and a real WebSocket smoke path.

### Changed

- **Per-User Channel arbitration** — `sessions/runtime/user-queue.ts` now has two
  lanes: committed FIFO work (`user_message`, Cron) and one collapsible
  best-effort slot (Heartbeat / perception-triggered Monitoring Turns). The
  Channel exposes `enqueueCommitted` and `enqueueBestEffort` while preserving
  transactional ingress and serialized reads.
- **Post-connect routing** — `presence_update` updates the registered connection
  foreground state and `delivery_ack` is accepted as a no-op placeholder instead
  of returning `runtime_error`.
- **Turn Execution spine refactor** — `runtime/service/working-context.ts`
  now owns model-visible context gathering (`USER.md` + latest perception, with
  caller-supplied Procedure Floor), and `runtime/service/turn.ts` owns the shared
  assemble → invoke → transactional-record mechanism. `turn-runner.ts` and
  `cron-turn.ts` now build trigger-specific executions over that spine while
  preserving their public factories. `src/main.ts` wires one working-context
  assembler and one `Turn` executor into both interactive and Cron paths. Tests:
  new `test/working-context.test.mjs` and `test/turn.test.mjs`, plus adjusted
  turn-runner/cron/channel coverage.
- **`src/index.ts`** — exports `createTurn`, `createWorkingContext`, and the
  public `Turn` / `TurnExecution` types for composition and tests.
- **`src/config/env.ts` and `loadConfig`** ([Issue #36]) — required
  `OPENROUTER_API_KEY`; defaults for `OPENROUTER_BASE_URL` and `RUNTIME_MODEL`;
  optional paired `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` (with optional
  `LANGFUSE_BASE_URL`) exposed as `config.langfuse` when both keys are set.
  Tests: extended `test/config-env.test.mjs`.
- **`src/index.ts`** ([Issue #36]) — exports runtime adapter/turn-runner factories
  and turn types for tests and composition roots.
- **Per-User Channel deepening refactor** — consolidated the per-`user_id` write and read
  paths that `main.ts` previously assembled from five collaborators into one deep module,
  `sessions/runtime/per-user-channel.ts` (`createPerUserChannel`). Its `accept` commits the
  ledger marker + injected projection in one Neon transaction and its `readSnapshot` runs
  through the same in-memory ordering queue, so reads observe earlier accepted writes
  (ADR-0006/0009; read-after-write ordering now has a unit test). Absorbed and **removed**
  `sessions/service/ingest-event.ts`, `sessions/runtime/event-handler.ts`, and
  `gateway/service/session-snapshot-reader.ts` (with their `test/ingest-event.test.mjs`,
  `test/runtime-event-handler.test.mjs`, `test/session-snapshot-reader.test.mjs`; new
  `test/per-user-channel.test.mjs` tests the deepened interface). The session handle is now
  one canonical `BoundSession` (gateway type-only-imports it; `GatewaySession` deleted), and
  `post-connect-router.ts` is the single routing table — `history_backfill_request` → read,
  Runtime Ingress → write, anything else → explicit `runtime_error` (no silent no-op). The
  read-side port `SessionSnapshotReader` now lives in `conversation/types`. ADR-0009 amended
  to place the transaction commit inside the Channel; `CONTEXT.md` adds **Bound Session** and
  **Per-User Channel**.
- **`src/main.ts` composition root** ([Issue #29]) — wires the `conversation` repo, the
  **Per-User Channel** (`createPerUserChannel` with injected `project` seam), and
  queue-serialized `readSnapshot` for connect/backfill.
- **`gateway/service/connect.ts`, `gateway/ui/post-connect-router.ts`, and
  `gateway/ui/ws-handler.ts`** ([Issue #29]) — connect emits the Session Snapshot
  from `conversation.readSnapshot`; post-connect routes `history_backfill_request`
  through the same reader; history-unavailable paths return `service_unavailable`.
- **`src/main.ts` composition root** ([Issue #28]) — replaces the #25 in-memory Agent
  Instance registry with Neon-backed repos, wires the event ledger, per-user queue, and
  ingest pipeline for `user_message`, `context_snapshot`, and `session_end_marker`
  ingress events.
- **`gateway/service/connect.ts` and `gateway/ui/ws-handler.ts`** ([Issue #28]) —
  connect resolves `auth_subject → user_id` via Session Start rows; unstarted sessions
  close with `service_unavailable`. Post-connect handlers receive the bound session
  alongside parsed Protocol events; uncaught async failures return `service_unavailable`
  instead of unhandled rejections.
- **`src/index.ts`** — exports `loadConfig` / `AgentRuntimeConfig` instead of protocol
  and internal contract samples; also exports the testable connection-control factories
  and `mapJwtVerificationErrorToRuntimeError` from `gateway/service/auth-failure.ts`; #28
  adds session ledger/queue/ingest factories and ingress event types.

### Removed

- **Cron ephemeral-thread stopgap** — Cron no longer fires on `cron:...`
  ephemeral threads and no longer bypasses the Per-User Channel; ADR-0029
  retires that exception now that Post-Message-Back delivery exists.
- **Cron through Per-User Channel ingress** — removed the unreachable `cron`
  arm from `RuntimeIngressEvent`, `RuntimeEventKind`, `isRuntimeIngressEvent`,
  Per-User Channel turn dispatch/deduping, and the exported `CronFireEvent`.
  Production Cron continues to fire through `cronScheduler → createCronTurnHandler`
  on silent ephemeral threads (ADR-0017 amendment).
- **Upfront domain type scaffolds** — deleted placeholder `types/scaffold.ts` files and
  contract sample types under `src/domains/*` (lazy domain layout per ADR-0002; real
  folders arrive with each vertical slice). Removed `test/scaffold.test.mjs`.

### Added (earlier unreleased)

- **Phase 0 contracts resolved** ([Issue #10]) — all pre-implementation contracts are now
  locked in `CONTEXT.md` and `docs/adr/`, unblocking Phase 1 scaffolding:
  - **Persistence Adapter** — thin repo-owned wrapper around LangGraph's Postgres checkpoint
    store; shell domains never import LangGraph checkpoint types directly (ADR-0005 context).
  - **Bundle Path Set** — locked to six paths: `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`,
    `HEARTBEAT.md` (immutable Bundle Defaults), `USER.md`, `MEMORY.md` (agent-writable User
    Overlays). DeepAgents populates the knowledge files; the shell owns the VFS backend and
    path manifest.
  - **Session Snapshot shape** — `hello_ok.session_snapshot` is now a typed
    `{ messages: SessionMessage[], before_cursor: string | null }` projection; see ADR-0006.
  - **VFS write policy** — procedure files (`AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`,
    `HEARTBEAT.md`) reject agent writes; knowledge files (`USER.md`, `MEMORY.md`) are
    agent-writable overlays. Personalization in v1 rides the memory layer and Cron, not
    self-editing procedure files. Behavioral self-personalization deferred to its own future
    ADR (ADR-0005).
  - **Bundle version pinning** — resolved once per WebSocket connection at `hello_ok` from
    the then-latest version; reconnect is the only migration boundary; resolved version
    recorded on each `runtime_turns` row for the eval loop (ADR-0004 amendment).

- **`CONTEXT.md`** — deployable-local vocabulary file at `services/agent-runtime/CONTEXT.md`
  capturing the five Phase 0 decisions as named terms with avoid-lists, relationships, and
  flagged ambiguities (checkpoint vs snapshot vs session snapshot).

- **[ADR-0005]** `docs/adr/0005-agent-runtime-vfs-write-policy-and-deferred-self-personalization.md`
  — formalises the VFS write policy and defers agent-driven behavioral self-personalization.

- **[ADR-0006]** `docs/adr/0006-agent-runtime-session-snapshot-as-separate-projection.md`
  — formalises `SessionMessage` / `session_snapshot` as a history read-projection separate
  from the live `user_message`/`companion_message` wire events.

- **Domain scaffolds** _(superseded)_ — placeholder `types/scaffold.ts` files added during
  Phase 0; removed when the Runtime skeleton moved to lazy domain layout (ADR-0002) and
  the shared `src/config/` seam landed.

### Changed

- **`packages/protocol` — `hello_ok.session_snapshot`** replaced `z.unknown()` with
  explicit strict Zod schemas (`session_message`, `session_snapshot`, `SessionMessage`,
  `SessionSnapshot`). Exportable from `@intentive/protocol` (ADR-0006).

- **`packages/protocol` — `runtimeErrorCode`** extended with `"service_unavailable"` to
  match the existing contract test and allow the Runtime to signal transient backend
  unavailability to clients.

- **`docs/adr/0004`** amended inline — bundle version pin boundary clarified to
  "per WebSocket connection, reconnect is the migration boundary"; per-turn pinning and
  explicit `agent_instance`-level migration jobs documented as rejected alternatives.

- **`docs/adr/README.md`** — ADR-0005 and ADR-0006 indexed; ADR-0004 marked as refined
  and amended; next ADR number bumped to `0007`.

- **`AGENTS.md`** — `CONTEXT.md` added to "Always read first"; `bundles` domain entry
  corrected to list all six bundle paths with their immutable/writable designations.

- **`ARCHITECTURE.md`** — vocabulary pointer updated to reference both the
  root `CONTEXT-MAP.md` and the service-local `CONTEXT.md`; Codemap entry for
  `CONTEXT.md` added.
