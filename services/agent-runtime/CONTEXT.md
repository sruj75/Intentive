# Agent Runtime

The Agent Runtime is the always-alive, multi-tenant service that runs Companion behavior for every User. For monorepo-wide vocabulary, read the root `CONTEXT-MAP.md` first. This file captures terms and decisions specific to the Runtime deployable.

## Language

**Agent Runtime**:
The deployed, always-alive, multi-tenant service that runs Companion behavior for every user. Lives at `services/agent-runtime/`. Hosts long-running runtime state, agent loops, cron, and heartbeats — must stay resident, which is why it deploys to a GCE VM rather than to a stateless platform.
_Avoid_: Deep Agent (the service), OpenClaw Agent, v1-deepagent, per-user VM, serverless runtime

**Multi-Tenant**:
Shared compute, per-user isolation. One Agent Runtime process serves many users; each user has their own logical **Agent Instance** scoped by `user_id` alone. There is no second-level grouping (no org, team, workspace, or `tenant_id`) in v1 — the User is the tenant.
_Avoid_: tenant_id, per-tenant schema, B2B isolation, per-user VM

**Agent Instance**:
The per-user logical record (id, config, conversation handle, status) inside the Agent Runtime. Created synchronously on first chat entry. Not a process, not a VM, not a container — a row.
_Avoid_: per-user VM, runtime process, container

**DeepAgents**:
The LangChain TypeScript library (`langchain-ai/deepagentsjs`) the Agent Runtime is built on. Reference only — never a name for our service or product.
_Avoid_: Deep Agent, the runtime, the agent

**Conversation History**:
The complete record of messages between a User and their Companion. Owned exclusively by the **Agent Runtime** in its Neon schema. The Mobile Client does not persist messages locally — it reads the authoritative timeline from the WebSocket reconnect snapshot on every cold open.
_Avoid_: on-device chat store, local conversation cache, two-sided sync, mock messages in the app

**Post-Message-Back**:
The Agent Runtime's primitive for **deliberately** interrupting a user with a message. Distinct from a regular reply. Invoked when the agent has decided "this is worth a push notification." The Runtime delivers the message into the **Conversation History** *and* — if the user is not connected — calls Control Plane's `POST /internal/notifications/push` to fire an APNs push. Every push notification in V1 originates from a Post-Message-Back; regular replies do not push.
_Avoid_: auto-notify on reply, "agent replied while you were away" push, background sync

**Cron**:
The Agent Runtime's scheduled-trigger primitive. Allows the agent to decide on its own time ("ping the user at 9am tomorrow about the deadline"). A Cron firing may or may not result in **Post-Message-Back** — the agent decides whether the trigger is worth interrupting for.
_Avoid_: scheduled notification, background reminder

**Heartbeat**:
The Agent Runtime's interval-trigger primitive (e.g., "every N minutes while a Capture Session is active, evaluate state"). Distinct from Cron because it is periodic and tied to liveness rather than absolute time. Like Cron, a Heartbeat tick may or may not produce a **Post-Message-Back**.
_Avoid_: keep-alive ping, presence beacon (those are transport-layer concerns)

**Persistence Adapter**:
The thin repo-owned wrapper that the `runtime/` and `memory/` domains use to save and load DeepAgents checkpoints. Wraps LangGraph's Postgres checkpoint store internally so that shell code never imports LangGraph checkpoint types directly.
_Avoid_: LangGraph store (as a direct domain dependency), checkpoint store (too generic), DIY checkpoint tables

**Checkpoint**:
The serialized mid-turn state that LangGraph saves to Postgres after each DeepAgents step — tool calls, reasoning traces, partial results. Managed by the Persistence Adapter; shell code does not read or write checkpoint rows directly.
_Avoid_: state snapshot, agent state (ambiguous with Agent Instance status)

## Relationships

- The **Persistence Adapter** wraps LangGraph's Postgres checkpoint store.
- The `runtime/` and `memory/` domains depend on the **Persistence Adapter** interface, not on LangGraph types.
- **Checkpoints** are written by LangGraph via the **Persistence Adapter** on every DeepAgents step within a turn.

## Flagged ambiguities

- "checkpoint" vs "snapshot" — resolved: **Checkpoint** is LangGraph turn state; **Context Snapshot** is the Desktop's screen-capture summary event; **Session Snapshot** is the reconnect history projection. Three unrelated concepts that all once read as "snapshot."
- `hello_ok.session_snapshot` was typed `z.unknown()` in `packages/protocol` — resolved to the **Session Snapshot** shape above and implemented as explicit `session_message`/`session_snapshot` Zod schemas (see ADR-0006).

**Bundle Path Set**:
The canonical list of VFS paths the `bundles/` domain knows to resolve at session start. Defines *where* the shell looks, not *what is inside*. Bundle paths resolve overlay-first (user overlay wins over the pinned bundle default). Content of each path is a product concern seeded separately and evolves independently of the shell build.
_Avoid_: bundle content, document templates, workspace files (too implementation-specific)

**Bundle Default**:
The immutable, versioned document stored at a bundle path for all users. Read when no user overlay exists for that path.
_Avoid_: system prompt, base document

**Pinned Bundle Version**:
The single bundle version a connection's turns resolve Bundle Defaults against. Resolved once at `hello_ok` from the then-latest version and held fixed for the life of the WebSocket connection. A reconnect re-resolves and is the only migration boundary. Recorded on each turn record for observability.
_Avoid_: active version, current bundle, live version

**User Overlay**:
A mutable document stored per `(user_id, path)`. Written by the agent (e.g. USER.md, MEMORY.md) or seeded empty on first session. Takes precedence over the Bundle Default on read.
_Avoid_: user file, personal context file, user document

**Session Snapshot**:
The authoritative read projection of Conversation History returned in `hello_ok.session_snapshot` on every reconnect. A history read-model, deliberately separate from the live wire events. Shape: `{ messages: SessionMessage[], before_cursor: string | null }` where `messages` is the most recent N entries (default 50) oldest-first, and `before_cursor` is non-null when older history exists.
_Avoid_: reconnect payload, hello payload, message backlog

**Session Message**:
A single uniform timeline entry inside a Session Snapshot, built for rendering: `{ message_id, author: "user" | "companion", body, at (datetime), via_post_message_back: boolean }`. Distinct from the live `user_message`/`companion_message` wire events — it is a history projection with its own axis of change. `via_post_message_back` is always present and `false` for user-authored entries.
_Avoid_: reusing user_message/companion_message for history, timeline event, history row

## Relationships

- The **Persistence Adapter** wraps LangGraph's Postgres checkpoint store.
- The `runtime/` and `memory/` domains depend on the **Persistence Adapter** interface, not on LangGraph types.
- **Checkpoints** are written by LangGraph via the **Persistence Adapter** on every DeepAgents step within a turn.
- The **Bundle Path Set** defines what paths the `bundles/` domain resolves at session start.
- Each path resolves to either a **User Overlay** (if one exists for that `user_id`) or a **Bundle Default**.
- Content inside each path is not a shell concern — the shell loads whatever is there and passes it to DeepAgents.

## Decisions

**Persistence Adapter is a thin wrapper (not direct LangGraph coupling)**
Decided 2026-05-29. Shell domains import the Persistence Adapter interface; LangGraph checkpoint types stay inside the adapter implementation. This keeps the `runtime/` and `memory/` domains free of LangGraph internals and makes the store swappable without touching domain code. Alternatives considered: DIY Postgres checkpoint tables (too much duplicated logic) and raw LangGraph store usage in domain code (too coupled to LangGraph internals).

**v1 Bundle Path Set is locked to six paths**
Decided 2026-05-29. The `bundles/` domain resolves exactly these paths at session start: `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`, `USER.md`, `MEMORY.md`. All six are seeded as empty Bundle Defaults on first deploy. `USER.md` and `MEMORY.md` are User Overlay paths — DeepAgents writes their content over time via the VFS backend; the shell does not author them. `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, and `HEARTBEAT.md` are Bundle Defaults whose content is a product concern, authored and versioned separately from the shell build.

**VFS write policy: procedure files immutable, knowledge files writable**
Decided 2026-05-29. The VFS backend splits the path set into two buckets by what the file *is*:
- **Procedure (immutable in v1):** `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`. These define how the Companion reasons and behave as the centrally-controlled product floor. Agent writes to these paths are **rejected** — they are not routed to overlays. This preserves the ability to ship a fixed/improved bundle version (e.g. from Langfuse eval signal) to all users, including existing ones, without a user overlay shadowing the update.
- **Knowledge (agent-writable overlays):** `USER.md`, `MEMORY.md`. The agent writes learned, personal facts here over time. These are User Overlays with no Bundle Default to shadow.

Personalization in v1 expresses through the knowledge layer plus **Cron** (scheduled actions), not by the agent editing its own procedure files. Worked example: the agent learns "user takes a pill ~9pm" → writes the fact to `USER.md`/`MEMORY.md`, creates a Cron job to fire at 9pm; `HEARTBEAT.md` is read (never written) to decide whether a given tick is worth a Post-Message-Back.

**Bundle version is pinned per WebSocket connection**
Decided 2026-05-29. The Pinned Bundle Version is resolved once at `hello_ok` (from the then-latest version) and held fixed for the connection's lifetime; every turn on that connection resolves Bundle Defaults against it. A reconnect is the migration boundary — it re-resolves to whatever is latest at that moment. The resolved version is written to each `runtime_turns` row so "which bundle produced this behavior?" is always answerable (matters for the Langfuse eval loop). This honors ADR-0004's "migrate at reconnect, never mid-turn" boundary. Alternatives rejected: per-turn pinning (risks behavioral drift within one conversation) and explicit `agent_instance`-level migration jobs (more control than v1 needs; can strand users on stale bundles).

**Agent-driven behavioral self-personalization is deferred to its own ADR.** Letting the agent overlay procedure files (`AGENTS.md`/`HEARTBEAT.md`) is a hard, near-irreversible mechanism entangling override-vs-augment semantics, base-version migration, and the safety floor. It must not be a silent Phase 0 default. When built, it should be **augment** (base always loaded, learned layer composed on top) rather than **replace** (overlay shadows base), so central bundle improvements still reach personalized users.
