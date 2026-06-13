# Agent Runtime

The Agent Runtime is the always-alive, multi-tenant service that runs Companion behavior for every User. For monorepo-wide vocabulary, read the root `CONTEXT-MAP.md` first. This file captures terms and decisions specific to the Runtime deployable.

The Companion is an **exocortex** that scaffolds users with executive dysfunction (ADHD) across Brown's six executive functions (Activation, Focus, Effort, Emotion, working Memory, Action), running psychological intervention as a real-time **body-double**: it continuously ingests **Context Snapshots** from the user's devices and uses its own situational judgment to decide when to intervene. This purpose drives the runtime design — see the "single unified brain" decision below (ADR-0014).

## Language

**Agent Runtime**:
The deployed, always-alive, multi-tenant service that runs Companion behavior for every user. Lives at `services/agent-runtime/`. Hosts long-running runtime state, agent loops, cron, and heartbeats — must stay resident, which is why it deploys to a GCE VM rather than to a stateless platform.
_Avoid_: Deep Agent (the service), OpenClaw Agent, v1-deepagent, per-user VM, serverless runtime

**Multi-Tenant**:
Shared compute, per-user isolation. One Agent Runtime process serves many users; each user has their own logical **Agent Instance** scoped by `user_id` alone. There is no second-level grouping (no org, team, workspace, or `tenant_id`) in v1 — the User is the tenant.
_Avoid_: tenant_id, per-tenant schema, B2B isolation, per-user VM

**Agent Instance**:
The per-user logical record (id, config, conversation handle, status) inside the Agent Runtime. Created synchronously on first chat entry. Not a process, not a VM, not a container — a **row**. Its durable truth (checkpoint + bundles + memory + Conversation History) lives in Neon; a live in-memory brain is built **on demand** when a trigger fires for that user and **dropped when the user goes quiet** — so the server serves many users without keeping an idle brain per user. (Plain English: the agent lives as data, wakes up on demand, sleeps when quiet.) See the lifecycle decision below and ADR-0018.
_Avoid_: per-user VM, runtime process, container, resident brain

**DeepAgents**:
The LangChain TypeScript library (`langchain-ai/deepagentsjs`) the Agent Runtime is built on. Reference only — never a name for our service or product.
_Avoid_: Deep Agent, the runtime, the agent

**Conversation History**:
The complete record of messages between a User and their Companion. Owned exclusively by the **Agent Runtime** in its Neon schema. The Mobile Client does not persist messages locally — it reads the authoritative timeline from the WebSocket reconnect snapshot on every cold open.
_Avoid_: on-device chat store, local conversation cache, two-sided sync, mock messages in the app

**Post-Message-Back**:
The Agent Runtime's primitive for **deliberately** interrupting a user with a message. Distinct from a regular reply. Modeled as a **DeepAgents tool the agent calls** (not a shell-side classification of the agent's text) — the call itself is the deliberate signal and creates the delivery record. The tool handler delivers the message into the **Conversation History** _and_ decides, by connection state, whether to also stream live (connected) or call Control Plane's `POST /internal/notifications/push` to fire an APNs push (offline). Every push notification in V1 originates from a Post-Message-Back; regular replies do not push. See ADR-0013.
_Avoid_: auto-notify on reply, "agent replied while you were away" push, background sync

**Cron**:
The Agent Runtime's absolute-time scheduled-trigger primitive. Allows the agent to decide on its own time ("ping the user at 9am tomorrow about the deadline"). In v1 a Cron fire is a **scheduled main-session wake** — it runs against the user's one checkpoint on the **Per-User Channel** (like a timer-triggered Monitoring Turn), so a reminder is grounded in the full relationship context, not an isolated blind turn. Silent-by-default with **Post-Message-Back** egress (ADR-0013); the agent decides whether the trigger is worth interrupting for. Unlike a Monitoring Turn, a Cron fire also persists a durable **job/run record** ("cron schedules; tasks record what ran"). OpenClaw's **isolated**/custom cron sessions are **deferred** to the first background-chore use case (see ADR-0017). Distinct from **Heartbeat** (periodic/liveness) and the **Monitoring Turn** it shares the main-session lane with.
_Avoid_: scheduled notification, background reminder

**Heartbeat**:
The Companion's **always-on proactivity engine**: the periodic trigger that wakes a **Monitoring Turn** in the main session — _not_ a separate brain or monitoring loop (this matches OpenClaw, where the heartbeat runs a periodic agent turn in the main session _as the_ proactivity mechanism). It fires on cadence **regardless of capture session or connection state** — it is the reason the agent is proactive at all, so it must reach the user whether they are at a laptop, at the gym, or driving. It is **not** gated on **Context Snapshots** flowing: a Heartbeat tick and an arriving Context Snapshot are the **two triggers of the one Monitoring Turn** (ADR-0015), but they are not equal in role — the Heartbeat is the engine, the snapshot merely _enriches_ a turn when present. On a tick the main agent reads the immutable `HEARTBEAT.md` procedure (how to evaluate) + its `MEMORY.md` watch-list (what to watch) + whatever it knows (temporal grounding, durable memory, mobile signals, and the sensory buffer _if_ snapshots exist), then judges for itself whether to intervene. The only coarse gate is an **active/quiet-hours** floor for cost/safety (ADR-0018); even within hours, whether to interrupt stays the agent's judgment (ADR-0014). Distinct from **Cron** because it is periodic/cadence-driven rather than absolute-time. Like Cron, a tick may or may not produce a **Post-Message-Back**.
_Avoid_: keep-alive ping, presence beacon (those are transport-layer concerns)

**Monitoring Turn**:
The single monitoring mechanism: one real agent turn in the main session that asks "should I intervene right now?", reading the immutable `HEARTBEAT.md` procedure + the user's `MEMORY.md` watch-list + the injected sensory buffer, then staying silent or calling **Post-Message-Back**. It has **two triggers** — a **Heartbeat** tick (timer) or an arriving **Context Snapshot** (perception) — not two systems. One judgment per wake enters the thread, not each raw snapshot. Distinct from **Cron** (absolute-time scheduled action). See ADR-0015.
_Avoid_: monitoring loop / monitoring system (implies a separate brain), saliency gate (no shell-side judgment), snapshot message (snapshots enter via the sensory buffer, not as thread messages)

**Interactive Turn**:
A `user_message`-triggered agent turn whose returned final message **is** the reply — delivered and persisted as a `companion_message`, with no shell-side output classification (ADR-0013). The interactive counterpart to the **Monitoring Turn**; both run one-at-a-time on the **Per-User Channel**. Distinct from a _proactive_ turn (cron fire / heartbeat tick / context snapshot), which is silent by default and speaks only via **Post-Message-Back**.
_Avoid_: chat turn, reply turn, normal turn

**Persistence Adapter**:
The thin repo-owned wrapper that the `runtime/` and `memory/` domains use to save and load DeepAgents checkpoints. Wraps LangGraph's Postgres checkpoint store internally so that shell code never imports LangGraph checkpoint types directly.
_Avoid_: LangGraph store (as a direct domain dependency), checkpoint store (too generic), DIY checkpoint tables

**Checkpoint**:
The thread state LangGraph saves to Postgres after each DeepAgents step (tool calls, reasoning traces, partial results) and accumulates across turns. Because `thread_id` is stable per user, the persisted thread state **is the model's cross-turn working memory**, bounded by DeepAgents' native summarization/offloading middleware — not a mid-turn-only scratchpad. Managed by the Persistence Adapter; shell code does not read or write checkpoint rows directly. See ADR-0012.
_Avoid_: state snapshot, agent state (ambiguous with Agent Instance status)

**Runtime Turn**:
The durable per-turn record (the `runtime_turns` row: `trace_id`, `thread_id`, `model`, `status`, timestamps; `bundle_version` added once #37 lands) — the observability/eval anchor that joins our relational record to the **Langfuse** trace answering "what did the model see on turn N?" (ADR-0012). Written by the shell in one transaction with the companion `conversation_messages` append, so the product record and the turn record stay mutually consistent. Distinct from the opaque **Checkpoint** (the model's working memory) and from the turn _execution_ itself.
_Avoid_: turn log, run row (too generic), runtime event (that is the ingress ledger)

**Bundle Path Set**:
The canonical list of VFS paths the `bundles/` domain knows to resolve at session start. Defines _where_ the shell looks, not _what is inside_. Bundle paths resolve overlay-first (user overlay wins over the pinned bundle default). Content of each path is a product concern seeded separately and evolves independently of the shell build.
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
A single uniform timeline entry inside a Session Snapshot, built for rendering: `{ message_id, author: "user" | "companion", body, at (datetime), via_post_message_back: boolean }`. Distinct from the live `user_message`/`companion_message` wire events — it is a history projection with its own axis of change. `via_post_message_back` is always present and `false` for user-authored entries. `at` is the **server record time** (when the Runtime durably accepted the message), not the client's `sent_at`; ordering uses a monotonic per-message sequence so equal `at` values never tie.

**History Backfill**:
A **read** request for the page of Conversation History older than a cursor, served by the same projection as the reconnect snapshot via a generalized `readSnapshot(userId, before?)`. The response reuses the **Session Snapshot** shape. Backfill is a pure read: it does **not** enter the `runtime_events` ledger or write path, but its Session Snapshot read is still serialized behind pending per-User work so reconnect/backfill observes earlier accepted events. See ADR-0006 (Amendment).
_Avoid_: pagination event (too generic), load-more (UI term), history sync

**Bound Session**:
The authenticated per-connection session handle (`userId`, `clientKind`, `agentInstanceId`). Produced at connect once the JWT is verified and the Agent Instance is resolved, then carried for the life of the WebSocket connection and consumed by the **Per-User Channel**. The one canonical shape — the gateway type-only-imports it from the `sessions` domain rather than redeclaring it.
_Avoid_: GatewaySession, connection context

**Per-User Channel**:
The single per-`user_id` serialization point in the always-alive Runtime process — and the **single run-loop**: every trigger that would start an agent turn (a `user_message`, a Context Snapshot, a Heartbeat tick, a Cron fire) is arbitrated here, and **exactly one agent turn runs at a time** against that user's one checkpoint (the concurrency consequence of one brain + one eternal thread; ADR-0011/0014). It is the analog of OpenClaw's `SessionKey`, which is "the bucket key used to store context _and control concurrency_." All stateful ingress (the `runtime_events` ledger marker + Conversation History projection in one transaction) and all Conversation History reads also pass through it, so reads observe earlier accepted writes. Trigger arbitration (FIFO user turns; collapsing Monitoring Turns; prioritized cron) is defined by ADR-0016. Wraps the in-memory ordering queue (ADR-0007); owns the transactional ingress commit (ADR-0009). Consumes a **Bound Session** on `accept`.
_Avoid_: job queue, session writer, durable queue

**Context Snapshot**:
A perception event **pushed by the client** (macOS/iOS) over the Protocol — the runtime does not poll for it — summarizing what the user is doing, keeping the agent grounded in reality. As an inbound push it enters the **Per-User Channel** like a `user_message`; a rapid burst is debounced. Snapshots accumulate in a shell-maintained **sensory buffer** (recent raw perception) that is injected into each **Monitoring Turn**; they are **not** appended to the brain's thread as individual messages, **not** written to `conversation_messages`, and **not** rendered as chat. The unit that enters the thread is the Monitoring Turn (one judgment per wake), not the raw snapshot. A snapshot arriving is also one of the two triggers of a Monitoring Turn (see the monitoring decision below, ADR-0015). Distinct from **Session Snapshot** (reconnect history) and **Checkpoint** (LangGraph turn state).
_Avoid_: screen log, activity event (too generic), telemetry ping

**Unified Working Context**:
The single per-user reasoning context the brain operates over — the tier-1 LangGraph thread checkpoint (conversation + prior monitoring judgments + temporal grounding) **plus** the injected **sensory buffer** of recent Context Snapshots **plus** tier-2 durable memory. One brain, one context, fed by every source. The DeepAgents two tiers are **time horizon** (recent working context vs durable long-term memory), **not source** (chat vs screen). There is no second isolated context; splitting it would split the brain. See ADR-0014.
_Avoid_: chat context (too narrow), perception thread, isolated session

## Relationships

- The **Persistence Adapter** wraps LangGraph's Postgres checkpoint store.
- The `runtime/` and `memory/` domains depend on the **Persistence Adapter** interface, not on LangGraph types.
- **Checkpoints** are written by LangGraph via the **Persistence Adapter** on every DeepAgents step within a turn.
- The **Unified Working Context** is fed by every source (user messages, Context Snapshots, temporal grounding); the shell delivers reality and executes actions but never judges intervention.
- The **Per-User Channel** is the single run-loop: every trigger (`user_message`, Context Snapshot, Heartbeat tick, Cron fire) is arbitrated there and exactly one agent turn runs at a time against that user's checkpoint (ADR-0016).
- One process-wide **scheduler** holds all users' heartbeat cadence + cron due-times and _wakes_ a user's Per-User Channel for offline triggers; the per-user brain is hydrated on demand and evicted when idle (ADR-0018).
- The **Bundle Path Set** defines what paths the `bundles/` domain resolves at session start.
- Each path resolves to either a **User Overlay** (if one exists for that `user_id`) or a **Bundle Default**.
- Content inside each path is not a shell concern — the shell loads whatever is there and passes it to DeepAgents.

## Flagged ambiguities

- "checkpoint" vs "snapshot" — resolved: **Checkpoint** is LangGraph turn state; **Context Snapshot** is the Desktop's screen-capture summary event; **Session Snapshot** is the reconnect history projection. Three unrelated concepts that all once read as "snapshot."
- "session" must never mean the conversation/transcript — resolved 2026-06-13. The continuous companion conversation is **Conversation History** owned by the **Agent Instance**, not a "session." The only legitimate qualified uses of "session" are **Bound Session** (the authenticated WebSocket connection), **Capture Session** (the Desktop screen-capture period ended by `session_end_marker`), and **Session Snapshot** (the reconnect history projection). OpenClaw's conversation-`session`/`sessionId` concept (with daily/idle reset) does **not** exist in our system — see the "one eternal conversation" decision below.
- `hello_ok.session_snapshot` was typed `z.unknown()` in `packages/protocol` — resolved to the **Session Snapshot** shape above and implemented as explicit `session_message`/`session_snapshot` Zod schemas (see ADR-0006).
- "monitoring" must never imply a separate brain or a screen-capture dependency — resolved 2026-06-13. The **Monitoring Turn** is one main-session agent turn (ADR-0015); the **Heartbeat** is the connection-independent proactivity engine (ADR-0018); **Context Snapshots** only enrich a turn when present. Avoid "monitoring loop/system," "saliency gate," and "snapshot message."

## Decisions

**Persistence Adapter is a thin wrapper (not direct LangGraph coupling)**
Decided 2026-05-29. Shell domains import the Persistence Adapter interface; LangGraph checkpoint types stay inside the adapter implementation. This keeps the `runtime/` and `memory/` domains free of LangGraph internals and makes the store swappable without touching domain code. Alternatives considered: DIY Postgres checkpoint tables (too much duplicated logic) and raw LangGraph store usage in domain code (too coupled to LangGraph internals).

**v1 Bundle Path Set is locked to six paths**
Decided 2026-05-29. The `bundles/` domain resolves exactly these paths at session start: `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`, `USER.md`, `MEMORY.md`. All six are seeded as empty Bundle Defaults on first deploy. `USER.md` and `MEMORY.md` are User Overlay paths — DeepAgents writes their content over time via the VFS backend; the shell does not author them. `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, and `HEARTBEAT.md` are Bundle Defaults whose content is a product concern, authored and versioned separately from the shell build.

**VFS write policy: procedure files immutable, knowledge files writable**
Decided 2026-05-29. The VFS backend splits the path set into two buckets by what the file _is_:

- **Procedure (immutable in v1):** `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`. These define how the Companion reasons and behave as the centrally-controlled product floor. Agent writes to these paths are **rejected** — they are not routed to overlays. This preserves the ability to ship a fixed/improved bundle version (e.g. from Langfuse eval signal) to all users, including existing ones, without a user overlay shadowing the update.
- **Knowledge (agent-writable overlays):** `USER.md`, `MEMORY.md`. The agent writes learned, personal facts here over time. These are User Overlays with no Bundle Default to shadow.

Personalization in v1 expresses through the knowledge layer plus **Cron** (scheduled actions), not by the agent editing its own procedure files. This includes **what the Companion watches for**: the agent "programs its own monitoring" by writing per-user **watch-items** into the writable knowledge layer (`MEMORY.md`), _not_ by editing `HEARTBEAT.md`. `HEARTBEAT.md` stays the immutable procedure for _how_ to run a Monitoring Turn; `MEMORY.md` carries the personal watch-list of _what_ to watch. A Monitoring Turn reads both. Worked example: the agent learns "user takes a pill ~9pm" → writes the fact (and any "watch for evening-routine drift" watch-item) to `USER.md`/`MEMORY.md`, creates a Cron job to fire at 9pm; `HEARTBEAT.md` is read (never written) to decide whether a given tick is worth a Post-Message-Back. See ADR-0015.

**Bundle version is pinned per WebSocket connection**
Decided 2026-05-29. The Pinned Bundle Version is resolved once at `hello_ok` (from the then-latest version) and held fixed for the connection's lifetime; every turn on that connection resolves Bundle Defaults against it. A reconnect is the migration boundary — it re-resolves to whatever is latest at that moment. The resolved version is written to each `runtime_turns` row so "which bundle produced this behavior?" is always answerable (matters for the Langfuse eval loop). This honors ADR-0004's "migrate at reconnect, never mid-turn" boundary. Alternatives rejected: per-turn pinning (risks behavioral drift within one conversation) and explicit `agent_instance`-level migration jobs (more control than v1 needs; can strand users on stale bundles).

**Agent-driven behavioral self-personalization is deferred to its own ADR.** Letting the agent overlay procedure files (`AGENTS.md`/`HEARTBEAT.md`) is a hard, near-irreversible mechanism entangling override-vs-augment semantics, base-version migration, and the safety floor. It must not be a silent Phase 0 default. When built, it should be **augment** (base always loaded, learned layer composed on top) rather than **replace** (overlay shadows base), so central bundle improvements still reach personalized users.

**Runtime durable state is three separate concerns, not one store.**
Decided 2026-06-09. Everything the Runtime persists lands in Neon, but it splits into three storages with different access patterns and guarantees, and they are never conflated:

- **Event / conversation log** — relational tables (`runtime_events` ledger, `conversation_messages`). Needs per-`user_id` time-ordering and unique-constraint idempotency. Shell-owned. This is the OpenClaw transcript equivalent.
- **Agent document workspace (VFS)** — path-addressed documents (the **Bundle Path Set**: `USER.md`, `MEMORY.md`, …), exposed to DeepAgents as a virtual filesystem (`ls`/`read`/`write`/`edit`/`glob`/`grep`) over a custom Neon-backed DeepAgents backend (rows keyed by path). The OpenClaw workspace-files equivalent.
- **Agent mid-turn state (Checkpoints)** — opaque per-step serialized state, managed by the **Persistence Adapter** over LangGraph's Postgres checkpoint store.

The event log is deliberately **not** a VFS file: idempotency (unique constraint) and ordering are relational powers a path-keyed store cannot give, and they are exactly what the per-user serialization invariant depends on. OpenClaw splits the same way (transcript dir vs workspace files vs agent state); we back all three with Neon instead of local disk. `runtime_events` (#28) touches only the first concern.

This grouping is by **storage family** (relational, Neon, shell-owned), **not** by module ownership. Within the event/conversation log family, `runtime_events` and `conversation_messages` live in **different domains** because they hide independently-varying decisions: `sessions` owns ordering + idempotency (`runtime_events`), and `conversation` owns the readable transcript + Session Snapshot projection (`conversation_messages`). See ADR-0008. Do not read "one storage family" as "one domain."

**Prompt assembly: eager-inject the procedure floor via trigger-aware dynamic middleware; read knowledge on demand via the VFS.**
Decided 2026-06-13. DeepAgents owns the _mechanism_ (system-prompt assembly, skills progressive disclosure, VFS read tools); Intentive's `bundles`/`memory` domains own the _content + overlay resolution_ and feed a **dynamic prompt middleware**. The split follows the existing procedure/knowledge line (ADR-0005):

- **Eager-injected** into the per-turn system prompt: the procedure floor (`SOUL.md`, `AGENTS.md`), the compact `USER.md` profile — composed by a middleware that is **trigger-aware** (`HEARTBEAT.md` on perception/heartbeat turns, `BOOTSTRAP.md` on first run).
- **Read on demand** via DeepAgents VFS tools over our custom Neon backend: `MEMORY.md`/daily traces — progressive disclosure that keeps an unbounded memory from blowing the window.

The prompt the model sees is assembled **per turn, per user, per trigger** — not a static string. Mirrors OpenClaw's hybrid (inject `SOUL`/`AGENTS`, read memory on demand) using DeepAgents-native mechanisms, so it does not fight the library. (**v1 has no skills** — see the next decision; when skills land they slot into this same eager-list / read-body-on-demand shape.)

**v1 has no skills and no subagents.**
Decided 2026-06-13. The v1 Companion is a **single brain** (ADR-0014) with the locked bundle files, the minimal all-internal tool surface (`post_message_back`, `schedule_cron`, VFS), monitoring, and cron — nothing more. We deliberately ship **no skill library** and **no subagent delegation** in v1.

- **No skills.** When skills _do_ arrive (post-v1), they are **immutable progressive-disclosure md files** — central, shipped, versioned like the procedure floor (ADR-0005), **not** agent-authored. The agent cannot build its own skills in v1; that may change after v1 but is not a v1 default. The prompt-assembly shape above already reserves the slot (eager skill _list_, read _body_ on demand) so adding them later does not disturb the design.
- **No subagents.** No delegated isolated workers in v1. DeepAgents supports subagents natively, so this is a _deferral_, not a missing capability — added when a concrete need appears (e.g. a heavy background chore alongside the deferred isolated cron, ADR-0017).

This keeps v1 minimal and avoids speculative machinery; both are DeepAgents-native when needed, so deferring costs us nothing. See ADR-0019.

**Single unified brain — the shell is senses and hands, the agent owns intervention judgment.**
Decided 2026-06-13. The Companion is a real-time body-double, so it must be continuously grounded in reality and judge for itself when to intervene:

- **One unified working context.** User messages and Context Snapshots feed the _same_ tier-1 working context and _same_ tier-2 durable memory. The two DeepAgents tiers are **time horizon**, not source. Proactive/perception runs are **not** isolated — isolating them would split the brain, and an exocortex must not fragment its own memory.
- **The shell is senses + hands, never a judge.** Senses: faithfully deliver reality (every Context Snapshot + temporal grounding); transduce raw device signals, never decide salience. Hands: execute the agent's chosen actions. No shell-side saliency gate.
- **The agent owns intervention judgment.** Every snapshot is a real agent turn; the agent decides silent-vs-act itself and acts only by calling an egress tool (Post-Message-Back). Its silent-vs-act choice is the only gate, and it is the agent's.
- **Display boundary ≠ brain boundary.** Snapshots feed the brain but are not rendered as chat; `conversation_messages` stays chat-only. One brain that sees all; one clean chat timeline.

Cost note: this means a full agent turn per snapshot per user — a scale concern to be solved by **agent-controlled cadence** later, never by returning judgment to the shell. See ADR-0014.

**Monitoring is one mechanism (a Monitoring Turn in the main session) with two triggers; `HEARTBEAT.md` stays immutable.**
Decided 2026-06-13. We do **not** reinvent monitoring. OpenClaw's heartbeat is a periodic agent turn in the **main session** — not a separate brain — and a Context Snapshot is _part of_ that same monitoring mechanism, not a redundant second one. So:

- **One mechanism: the Monitoring Turn.** A real agent turn on the Unified Working Context whose job is "should I intervene right now?" It runs in the main session (same brain, ADR-0014), reads the immutable `HEARTBEAT.md` procedure plus the user's `MEMORY.md` watch-list plus the injected sensory buffer, and either stays silent or calls `post_message_back` (egress default, ADR-0013).
- **Two triggers, same turn.** (1) **Heartbeat** — a periodic timer tick; (2) **Context Snapshot** — a perception event arriving from a device. Either fires the _same_ Monitoring Turn. They are not two systems.
- **Snapshots arrive via a sensory buffer, not as thread messages.** The shell accumulates recent Context Snapshots in a shell-maintained **sensory buffer** and injects it into the Monitoring Turn; the unit that enters the thread is the _one judgment per wake_, not each raw snapshot. (This reverses the earlier "snapshot-as-message" leaning.) Raw-snapshot archival for audit/replay is optional and served by Langfuse traces.
- **`HEARTBEAT.md` is immutable procedure (how to monitor); the watch-list is writable knowledge (what to watch).** The agent programs its own monitoring by writing watch-items to `MEMORY.md`, never by editing `HEARTBEAT.md` — preserving the centrally-improvable safety floor (procedure/knowledge split, consistent with the Bundle Path Set decision above and ADR-0005). Making `HEARTBEAT.md` agent-writable was considered and **rejected** for v1 (it drops the safety floor and reopens deferred self-personalization).
- **Cron is separate.** Cron is absolute-time scheduled action, a distinct primitive from the periodic/perception-driven Monitoring Turn.

See ADR-0015.

**The Per-User Channel is the single run-loop; trigger arbitration is FIFO user turns + collapsing Monitoring Turns + prioritized cron.**
Decided 2026-06-13. One brain + one eternal thread (ADR-0011/0014) means exactly **one checkpoint per user**, so two agent turns can never run against it concurrently. Rather than invent a lock, we promote the **Per-User Channel** (already the per-`user_id` ordering/ingress point) into the **single run-loop**: every trigger is arbitrated there and exactly one turn runs at a time. This mirrors OpenClaw, whose `SessionKey` is "the bucket key used to store context _and control concurrency_," with per-session FIFO and skip-when-busy heartbeats — we adapt, not reinvent.

- **`user_message` (inbound push):** enqueue, strict **FIFO, never dropped**; a rapid burst is **debounced** into one turn (OpenClaw's "debounced batch").
- **Context Snapshot (inbound push):** append to the **sensory buffer** and ensure **at most one pending Monitoring Turn**; a burst collapses into the buffer (ADR-0015), never one turn per snapshot.
- **Heartbeat tick (timer):** **skip-when-busy** — if the lane is busy or a Monitoring Turn is already pending, the tick is **dropped** (not queued); the next tick re-evaluates fresh state. This is OpenClaw's actual mechanism and is simpler than coalescing stale ticks.
- **Cron fire (timer):** enqueue (a committed scheduled action), with **priority over Monitoring Turns** (heartbeat defers to cron, per OpenClaw); never silently dropped.

Net invariant: **Monitoring Turns collapse to at most one pending per user and always reason over the latest buffer + state; user turns never collapse (FIFO); cron outranks monitoring; in-flight turns are never preempted.** See ADR-0016.

**v1 Cron runs in the main session (single brain), not an isolated session; isolation is deferred.**
Decided 2026-06-13. OpenClaw splits cron by _purpose_: reminders/system events run in the **main session**; reports/background chores run **isolated** (fresh transcript, no conversation context). Every v1 Intentive cron job is a **reminder/nudge** ("ping at 9am about the deadline"; "pill at 9pm") — OpenClaw's main-session category. So:

- **A Cron fire is a scheduled main-session wake** — it runs against the user's one checkpoint on the **Per-User Channel** (consistent with ADR-0016, which already enqueues cron on the per-user lane). It is silent-by-default with Post-Message-Back egress (ADR-0013), like a timer-triggered Monitoring Turn.
- **Why not isolated:** a reminder firing blind to the conversation (not knowing the user already submitted the thesis, or is sick) is the robotic split-brain ADR-0014 rejected — the _same_ argument, applied to scheduled actions. An isolated cron would also need its own lane/checkpoint _outside_ the ADR-0016 run-loop.
- **Isolation deferred, not denied.** OpenClaw isolates _background chores_ (heavy autonomous research/reports) — a category v1 lacks. When Intentive grows one, **isolated cron is the right tool for that job specifically**, added by purpose then — not a v1 default.
- **Cron still records.** Unlike a Monitoring Turn, a Cron fire persists a durable **job/run record** ("cron schedules; tasks record what ran") — the scheduled-job row + run history.

See ADR-0017.

**Agent Instance lifecycle: agents live as data, wake on demand, sleep when quiet — driven by one always-running scheduler. Heartbeat is the connection-independent proactivity engine.**
Decided 2026-06-13. "Always-alive" means the _server and the scheduler_ never sleep — **not** a brain-per-user. One VM serves many users, so we do not hold a live brain for every user.

- **Logical instance (lives as data).** The durable truth is Neon — checkpoint + bundles + memory + Conversation History. There is no resident per-user brain; the Agent Instance is a row (see term above).
- **Lazy hydration (wakes on demand).** When a trigger fires for a user — a `user_message`, a Context Snapshot, or a scheduler **wake** (heartbeat/cron) — the runtime builds that user's brain in memory _then_, by hydrating the checkpoint, and runs the turn on the Per-User Channel (ADR-0016).
- **Idle eviction (sleeps when quiet).** After the user goes quiet, the in-memory brain is dropped to free resources; nothing is lost because state is in Neon. The next trigger re-hydrates from scratch.
- **One process-wide scheduler drives offline triggers.** A single shell-owned scheduler holds every user's cron due-times (from Neon) and heartbeat cadence. When a timer is due for user X it **enqueues a trigger onto X's Per-User Channel**, hydrating the lane. This is what fires **heartbeat/cron for a user with no live connection** — the gym/driving case: proactivity reaches the user via Post-Message-Back push even with no laptop session open.
- **Heartbeat is the proactivity engine, connection-independent.** It fires on cadence regardless of capture session or connection; Context Snapshots only _enrich_ a Monitoring Turn when present (ADR-0015). Gated only by a coarse **active/quiet-hours** floor (cost/safety); interrupt-or-not stays the agent's judgment (ADR-0014).
- **Restart-resumable.** Neon-persisted checkpoints survive a VM restart; an in-flight turn resumes from its last checkpointed step (Persistence Adapter). On boot the scheduler rebuilds its timer wheel from Neon and fires overdue timers in a **controlled, non-stampeding** way (ADR-0016 skip-when-busy + snapshot debounce bound the monitoring stampede; cron overdue handling is a cron-slice detail).

See ADR-0018.

**DeepAgents-native memory: the thread checkpoint is the model's working memory; `conversation_messages` is the client/eval record.** (Supersedes the earlier "transcript is authoritative" decision; see ADR-0010 → ADR-0012.)
Decided 2026-06-13. Both OpenClaw and DeepAgents are battle-tested; the rule is to pick whichever is simpler and does not fight the tool we committed to. We committed to DeepAgents as the brain, so we use its **native two-tier memory** rather than porting OpenClaw's transcript-rebuild:

- **Model working memory (cross-turn)** = the LangGraph **thread checkpoint** (`thread_id` per user), carried natively across turns and bounded by DeepAgents' **summarization/offloading middleware**. We do not rebuild context from `conversation_messages`, and we do not hand-persist compaction summaries — the compacted state lives in the checkpoint.
- **`conversation_messages`** = a **parallel durable record** for client reads (Session Snapshot, History Backfill) and as the eval anchor, dual-written per turn. It is **not** the model's memory; the checkpoint is opaque, so clients need this queryable transcript regardless.
- **Long-term curated memory** = USER.md/MEMORY.md **User Overlays** via a custom Neon `BackendProtocolV2` backend namespaced by `user_id` (the docs' Postgres-VFS pattern) — the one piece the shell builds, using DeepAgents' own extension point.
- **"What did the model see on turn N?"** is answered by **Langfuse traces** (actual per-turn model input), not by replaying the transcript.

Risk parked to Phase 11: with one eternal thread per user (next decision), that thread is summarized indefinitely — summary-of-summary drift is a retention concern, not solved here.

**Egress is explicit DeepAgents tools + trigger-type default — not shell-side output classification.**
Decided 2026-06-13. The shell does **not** inspect the agent's final message and guess "silent / reply / Post-Message-Back." Instead:

- **Trigger type sets the default.** An **interactive** turn (`user_message`) delivers the agent's returned final message as the reply. A **proactive** turn (cron fire, heartbeat tick, context snapshot) is **silent by default** — the returned text is internal reasoning and is not delivered.
- **Proactive user-facing output happens only via the Post-Message-Back tool;** self-scheduling happens only via a schedule-cron tool. Tools are how the agent acts (DeepAgents-native); the tool call is explicit, auditable, and creates the durable record for free.
- We **drop** OpenClaw's sentinel-string classification (`HEARTBEAT_OK` / `NO_REPLY`): silence is simply "no egress tool called on a proactive turn," so no string parsing is needed.

This supersedes the implementation plan's "treat DeepAgents output as a candidate; the shell decides silent / normal reply / Post-Message-Back" language (Phase 5 step 6, Phase 10). See ADR-0013.

**v1 tool surface is minimal and all-internal; the permission/approval model is deferred until tools gain external blast radius.**
Decided 2026-06-13. The v1 Companion _perceives, remembers, talks, and schedules_ — it has no hands on the outside world yet. The tool set is exactly:

- `post_message_back(...)` — the one proactive egress (the agent's only path to a user-facing message on a proactive turn; handler persists + delivers-live-or-pushes).
- a self-scheduling `schedule_cron(...)` tool.
- DeepAgents' **built-in** VFS tools (`read`/`write`/`edit`/`ls`/`grep`/`glob`) over our custom Neon backend, for `USER.md`/`MEMORY.md` — native, not custom; the agent's memory is just file I/O.

Deliberately **absent in v1**: web search, code/shell exec, calendar/email writes, arbitrary HTTP. Because no v1 tool has dangerous external side effects, there is **no per-call approval gating** — all registered tools are allowed, and audit is just **tracing every tool call** (Langfuse + structured logs) plus the durable Post-Message-Back record. A trust-tier/approval model is built **later**, when the exocortex grows real-world hands (writing the user's calendar, sending on their behalf, spending money); building it now would be speculative.

**One eternal Companion conversation per user — no conversation reset in v1.**
Decided 2026-06-13. There is a single continuous **Conversation History** per `user_id`; `conversation_messages` is one unbroken stream, never segmented into per-conversation transcripts and never wiped. We deliberately **do not** adopt OpenClaw's `/new`, daily-reset (4am), or idle-expiry rollover into a new `sessionId`. The product is an always-on companion relationship, not discrete task sessions, and **compaction** (not reset) bounds context growth. This is a deliberate OpenClaw divergence under ADR-0001 and is consistent with ADR-0001's "one active continuous session per user." No user-initiated "start over" or forget seam is reserved in v1. See ADR-0011.

**Ingress ack is decoupled from turn success; turn failures are contained, not thrown.**
Decided 2026-06-14. The **Interactive Turn** runs inside the same Per-User Channel task as ingress (`txn{ledger + user-msg}` → `invoke` → `txn{companion append + runtime_turns}`). An **ingress-transaction** failure rejects `accept` (the message was not durably accepted); a **turn** failure (invoke/append) is **caught**, recorded as `runtime_turns(status = failed)`, and `accept` **resolves** — silent to the user, loud in the **Runtime Turn** record and logs, never thrown out of the lane (which would falsely signal ingress failure and leak an unhandled rejection out of `user-queue.ts`). No auto-retry in v1; crash-mid-turn resume is the checkpoint concern of ADR-0018. See ADR-0020.
