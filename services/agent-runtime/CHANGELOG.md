# Changelog

All notable changes to the Agent Runtime service. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this service will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Added

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
  `test/session-snapshot-reader.test.mjs`,
  `test/runtime-ingress-projection.integration.test.mjs`, plus extended connect/ws-handler
  coverage.
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
  `test/user-queue.test.mjs`, `test/ingest-event.test.mjs`,
  `test/runtime-event-handler.test.mjs`, `test/sessions-repo.integration.test.mjs`.
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

- **`src/main.ts` composition root** ([Issue #29]) — wires the `conversation` repo,
  transactional ingress projection (`ingest.queriesFor` + `sql.transaction`), and
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
