# Changelog

All notable changes to the Agent Runtime service. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this service will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Added

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

- **Domain scaffolds** — `src/domains/{bundles,cron,gateway,heartbeat,memory,protocol,
runtime,sessions}/types/scaffold.ts` and `src/domains/internal/types/sessions.ts` added
  so the layered domain tree is tracked by git, covered by typecheck, and visible to the
  architecture lint before any domain logic ships.

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

- **`docs/ARCHITECTURE.md`** — vocabulary pointer updated to reference both the
  root `CONTEXT-MAP.md` and the service-local `CONTEXT.md`; Codemap entry for
  `CONTEXT.md` added.
