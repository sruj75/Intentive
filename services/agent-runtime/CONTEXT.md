# Agent Runtime

The Agent Runtime is the always-alive, multi-tenant service that runs Companion behavior for every User. For monorepo-wide vocabulary, read the root `CONTEXT-MAP.md` first. This file captures terms and decisions specific to the Runtime deployable.

The Companion is an **exocortex** that scaffolds users with executive dysfunction (ADHD) across Brown's six executive functions (Activation, Focus, Effort, Emotion, working Memory, Action), running psychological intervention as a real-time **body-double**: it continuously ingests **Perception Events** from the user's devices and uses its own situational judgment to decide when to intervene. This purpose drives the runtime design — see the "single unified brain" decision below (ADR-0014).

## Language

**Agent Runtime**:
The deployed, always-alive, multi-tenant service that runs Companion behavior for every user. Lives at `services/agent-runtime/`. Hosts long-running runtime state, agent loops, cron, and heartbeats — must stay resident, which is why it deploys to a GCE VM rather than to a stateless platform.
_Avoid_: Deep Agent (the service), OpenClaw Agent, v1-deepagent, per-user VM, serverless runtime

**Multi-Tenant**:
Shared compute, per-user isolation. One Agent Runtime process serves many users; each user has their own logical **Agent Instance** scoped by `user_id` alone. There is no second-level grouping (no org, team, workspace, or `tenant_id`) in v1 — the User is the tenant.
_Avoid_: tenant_id, per-tenant schema, B2B isolation, per-user VM

**Agent Instance**:
The per-user logical record (id, config, conversation handle, status) inside the Agent Runtime. Created synchronously on first chat entry. Not a process, not a VM, not a container — a **row**. Its durable truth (checkpoint + bundles + memory + Conversation History) lives in Neon; the row also owns the one-time **Bootstrap Lifecycle** state. A live in-memory brain is built **on demand** when a trigger fires for that user and **dropped when the user goes quiet** — so the server serves many users without keeping an idle brain per user. (Plain English: the agent lives as data, wakes up on demand, sleeps when quiet.) See the lifecycle decision below and ADR-0018/0036.
_Avoid_: per-user VM, runtime process, container, resident brain

**Bootstrap Lifecycle**:
The durable one-time personalization state on an **Agent Instance**: `pending → in_progress → completed`. **Session Start** creates or loads the row but never calls DeepAgents. The first eligible **Opening Orientation** includes `BOOTSTRAP` and atomically moves `pending` to `in_progress`; the first successful **Interactive Turn** from the matching live, durably active Desktop Coaching Window includes `BOOTSTRAP` again and atomically completes it with the Companion reply. Closing the Desktop before responding leaves bootstrap in progress; late Desktop and Mobile messages remain ordinary turns, while a later eligible Coaching Window can resume bootstrap without inventing a second welcome mechanism. See ADR-0036.

**DeepAgents**:
The LangChain TypeScript library (`langchain-ai/deepagentsjs`) the Agent Runtime is built on. Reference only — never a name for our service or product.
_Avoid_: Deep Agent, the runtime, the agent

**Conversation History**:
The complete record of messages between a User and their Companion. Owned exclusively by the **Agent Runtime** in its Neon schema. In the Desktop-only v1, the Floating Bar reads the authoritative timeline from the WebSocket reconnect snapshot rather than owning a second local conversation.
_Avoid_: on-device chat store, local conversation cache, two-sided sync, mock messages in the app

**Post-Message-Back**:
The Agent Runtime's primitive for **deliberately** interrupting a user with a message. Distinct from a regular reply. Modeled as a **DeepAgents tool the agent calls** — `post_message_back({ body })`, **content only** (not a shell-side classification of the agent's text). The call itself is the deliberate signal: the tool mints `message_id`, stamps `emitted_at`, and forces `via_post_message_back = true`. Per ADR-0014 the agent owns _what/whether/when_ to say; transport stays deterministic. In Desktop-only v1, a Post-Message-Back may present only while its **Desktop Coaching Window** is active, by streaming to the connected Desktop and revealing the Floating Bar. It never falls back to mobile push or a macOS notification. The handler persists Conversation History before delivery; a result that completes after its window ends may remain in history but cannot interrupt a later window. See monorepo ADR-0006 and Agent Runtime ADR-0013/0028.
_Avoid_: auto-notify on reply, offline push, background coaching

**Delivery**:
How any Companion message reaches the User, and how that is recorded. The gateway owns a process-local connected-client registry, exposed as one shared delivery port consumed by both **Interactive Turn** replies and **Post-Message-Back**. The capability predicate is `{desktop}` in v1. Interactive replies stream to a connected Desktop and otherwise remain persisted for reconnect. Proactive delivery additionally requires the matching active **Desktop Coaching Window**; it streams or records a failed/no-longer-current attempt, never pushes. Delivery attempts remain in the unified append-only `deliveries` ledger, and `delivery_ack` remains a separate live receipt. See monorepo ADR-0006 and Agent Runtime ADR-0028.
_Avoid_: per-message socket lookup outside the registry, server-initiated send outside the shared port, separate push-only ledger

**Cron**:
The Agent Runtime's scheduled-trigger primitive. Lets the agent decide on its own time ("ping the user at 9am tomorrow about the deadline"). Adapts OpenClaw's three schedule kinds via the **`croner`** library: **`at`** (one-shot), **`every`** (fixed interval), and **`cron`** (5/6-field recurring expression). Each job is a **cron card** — a markdown file the agent authors with DeepAgents' built-in filesystem tools (`write_file`/`edit_file`/`ls`) under a reserved `/crons/` route, fronted by a purpose-built `cron_jobs` table with real `next_fire_at` and status columns. There are **no bespoke cron CRUD tools**: scheduling is file I/O to the agent, while the card is a relational row to the shell (ADR-0026 amendment). A shell-side **poll loop** (not an in-memory timer wheel) finds due jobs in Neon (`next_fire_at <= now()`), so restart-survival and missed-fire handling fall out of one indexed query (ADR-0024). Schedules are validated against a **5-minute minimum interval** (anti-spam / alarm-fatigue floor). A failed fire is retried on **transient errors only** (OpenClaw's `maxAttempts`/`backoffMs`/`retryOn` = rate-limit, overloaded, network, server-error) — these fail _before_ a turn delivers, so a retry re-attempts an un-delivered run, never re-nags; the agent _choosing to stay silent_ is a success, not a retryable failure. In issue #39 v1, a Cron fire runs a **silent ephemeral thread** grounded by the Procedure Floor, `USER.md`, and recent perception; it records a `cron_runs` row but does **not** mutate the user's main checkpoint or append Conversation History. **Flip decided 2026-06-16 (ADR-0029):** once #41 lands, a Cron fire rejoins the **Per-User Channel** and runs on the **main thread** in the committed/FIFO class, can **Post-Message-Back**, and drops the ephemeral thread; the scheduler keeps owning due-ness and lifecycle. `every` and Heartbeat coexist (as in OpenClaw): an `every` Cron is a specific, user-scoped recurring job that records runs; Heartbeat is the always-on engine that records nothing.
_Avoid_: scheduled notification, background reminder, absolute-time-only (it also does interval/recurring), cron expression as the only kind

**User Timezone**:
The IANA timezone (e.g. `America/New_York`) used to resolve wall-clock Cron schedules ("9pm" → an actual instant). The **device is the source of truth**: the client reports `client_tz` on every `connect`, and the runtime persists it as durable per-user state (alongside the **Agent Instance** row) so it is available when the user is offline — Cron fires for users with no live connection. Recurring jobs resolve the user's **current** timezone at fire time (travel-correct: "9pm wherever you are now"), unless a job carries an explicit per-job `tz` override (OpenClaw's `--tz`). Multiple devices: **last report wins**. UTC is the last-resort fallback only when no timezone has ever been reported. See ADR-0025.
_Avoid_: host timezone (no meaningful host tz in a multi-tenant process), server timezone, agent-remembered timezone (the device reports it, not the LLM)

**Heartbeat**:
The active-window timer floor that can wake a **Monitoring Turn** when Perception Events have not already done so. In Desktop-only v1 it is structurally gated by an active **Desktop Coaching Window** and targets a judgment opportunity within two minutes; outside a window it does not call the model or reach the User. Perception remains the primary clock, using Desktop's existing smart capture cadence and the Per-User Channel's collapsible best-effort lane. The timer only creates a judgment opportunity—the Companion still decides whether to stay silent or call **Post-Message-Back**. The older connection-independent, flat-forever floor is outside v1 under monorepo ADR-0006.
_Avoid_: keep-alive ping, presence beacon (those are transport-layer concerns)

**Monitoring Turn**:
The single monitoring mechanism: one real agent turn in the main session that asks "should I intervene right now?", applying the coaching behavior in `AGENTS.md` plus the `HEARTBEAT.md` monitoring procedure, the user's abstracted durable memory, and the injected window-scoped sensory buffer, then staying silent or calling **Post-Message-Back**. It has **two triggers** — an active-window **Heartbeat** floor or arriving window-scoped **Perception Events** — not two systems. The `MonitoringCoordinator` admits work only for a connected, actively attested matching **Desktop Coaching Window**, fixes the evidence upper cursor before execution, collapses bursts, and enforces the 120-second minimum judgment interval and trailing floor. One judgment per wake enters the thread, not each raw observation. Distinct from **Cron** (absolute-time scheduled action). See ADR-0015 and monorepo ADR-0006.
_Avoid_: monitoring loop / monitoring system (implies a separate brain), saliency gate (no shell-side judgment), snapshot message (snapshots enter via the sensory buffer, not as thread messages)

**Work-State Judgment**:
The Companion's revisable judgment about whether the User's current behavior appears to be advancing their declared important work or showing possible drift, blockage, confusion, or loss of focus. The Companion forms this hypothesis from available observations and conversation; the User can correct it. It is never a Client-produced classification or a claim that Intentive can directly read the User's internal mental state.
_Avoid_: mental-state detection, observable work state, frontend drift score, cognitive-state classifier

**Interactive Turn**:
A `user_message`-triggered agent turn whose returned final message **is** the reply — delivered and persisted as a `companion_message`, with no shell-side output classification (ADR-0013). The interactive counterpart to the **Monitoring Turn**; both run one-at-a-time on the **Per-User Channel**. Distinct from a _proactive_ turn (cron fire / heartbeat tick / context snapshot), which is silent by default and speaks only via **Post-Message-Back**.
_Avoid_: chat turn, reply turn, normal turn

**Turn Execution**:
The shared shell mechanism (`runtime/service/turn.ts`) every trigger uses to **resolve the pinned floor**, gather the model-visible context (Procedure Floor + `USER.md` + recent perception), invoke DeepAgents, and record durable outcome rows in one transaction. The spine owns what is universal to every turn: it resolves the floor (so a resolution failure becomes a normal failed turn rather than a separate outer path), stringifies errors, and writes the single **Runtime Turn** anchor — appended to the caller's rows on both the ok and failed path. Trigger-specific modules supply only the thread, floor source, _trigger-specific_ durable records, error policy, and egress default. This is the turn _mechanism_, distinct from the **Runtime Turn** row that observes it. See ADR-0031.
_Avoid_: trigger pipeline, turn pipeline, one pipeline per trigger

**Persistence Adapter**:
The thin repo-owned wrapper that the `runtime/` and `memory/` domains use to save and load DeepAgents checkpoints. Wraps LangGraph's Postgres checkpoint store internally so that shell code never imports LangGraph checkpoint types directly.
_Avoid_: LangGraph store (as a direct domain dependency), checkpoint store (too generic), DIY checkpoint tables

**Checkpoint**:
The thread state LangGraph saves to Postgres after each DeepAgents step (tool calls, reasoning traces, partial results) and accumulates across turns. Because `thread_id` is stable per user, the persisted thread state **is the model's cross-turn working memory**, bounded by DeepAgents' native summarization/offloading middleware — not a mid-turn-only scratchpad. Managed by the Persistence Adapter; shell code does not read or write checkpoint rows directly. See ADR-0012.
_Avoid_: state snapshot, agent state (ambiguous with Agent Instance status)

**Runtime Turn**:
The durable per-turn record (the `runtime_turns` row: `trace_id`, `thread_id`, `model`, `status`, `bundle_version`, trigger, optional Coaching Window and evidence-cursor/version fields, timestamps) — the observability/eval anchor that joins our relational record to the **Langfuse** trace answering "what did the model see on turn N?" (ADR-0012). **Every turn produces exactly one `runtime_turns` row** (ok or failed): the **Turn Execution** spine writes it for _every_ trigger — `user_message`, Opening Orientation, Monitoring Turn, **and Cron** — in the same transaction as that trigger's own rows (the companion `conversation_messages` append, or `cron_runs` + lifecycle), so the product record and the turn record stay mutually consistent. A successful Coaching Turn advances its window's evidence cursor only through the last included record; failure does not consume evidence. See ADR-0031 and monorepo ADR-0006. Distinct from the opaque **Checkpoint** (the model's working memory) and from the turn _execution_ itself.
_Avoid_: turn log, run row (too generic), runtime event (that is the ingress ledger)

**Bundle Path Set**:
_Superseded 2026-06-15 (ADR-0021)._ v1 is not a fixed set of VFS paths. The model splits into the **Procedure Floor** (injected versioned product content) and the **Per-User Memory** namespace (StoreBackend). Use those two terms; do not reintroduce a "six-path set."
_Avoid_: six-path set, bundle content, document templates, workspace files

**Procedure Floor** (was **Bundle Default**):
The immutable, versioned product content that defines how the Companion reasons and behaves — `SOUL`, `AGENTS`, `BOOTSTRAP`, and `HEARTBEAT`. Managed as the single `intentive-runtime-bundle` in **Langfuse Prompt Management** (ADR-0022), resolved by the `production` label, and **injected** into the per-turn system prompt by the prompt-assembly middleware — not stored as a VFS file and not agent-writable. The Human Performance Coach behavior lives in `AGENTS`; `BOOTSTRAP` is injected only while the durable **Bootstrap Lifecycle** is unfinished; `HEARTBEAT` adds monitoring-specific procedure. There is no deploy-bundled prompt copy: missing configuration, an unavailable label, a failed fetch, or a malformed bundle stops the Runtime from serving untrusted behavior.
_Avoid_: system prompt (as a static string), base document, bundle document (Neon row)

**Pinned Bundle Version**:
The Procedure Floor version a connection's turns are composed against — the **Langfuse prompt version(s)** resolved from the `production` label once at `hello_ok`, cached and held fixed for the life of the WebSocket connection. A reconnect re-resolves and is the only migration boundary. Recorded on each Runtime Turn (`bundle_version`) for the eval loop. See ADR-0022.
_Avoid_: active version, current bundle, live version

**Per-User Memory** (was **User Overlay**):
The agent's mutable per-user documents, stored in the DeepAgents **`StoreBackend`** over Neon, namespaced `(user_id,)`. Two kinds, one store, two injection policies: **`USER.md`** — the compact OpenClaw-style user profile the shell **injects every turn** (kept compact by instruction); and the **`/memories/` namespace** — multi-file long-term memory the agent reads/writes **on demand** via DeepAgents VFS tools (`ls`/`read`/`grep`/`glob`/`write`/`edit`), which the shell never auto-loads (DeepAgents owns LTM). Nothing here shadows a Procedure Floor document — there is no overlay merge in v1. See ADR-0021.
_Avoid_: user overlay, overlay-first, user file, personal context file, custom Neon backend

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
The single per-`user_id` serialization point in the always-alive Runtime process — and the **single run-loop** for main-checkpoint turns: every trigger that would start a main-thread agent turn (`user_message`, Cron fire, Perception Event, Heartbeat tick) is arbitrated here, and **exactly one agent turn runs at a time** against that user's one checkpoint (the concurrency consequence of one brain + one eternal thread; ADR-0011/0014). It is the analog of OpenClaw's `SessionKey`, which is "the bucket key used to store context _and control concurrency_." All stateful ingress (the `runtime_events` ledger marker + Conversation History projection in one transaction) and all Conversation History reads also pass through it, so reads observe earlier accepted writes. Trigger arbitration is defined by ADR-0016/0029: committed FIFO work (`user_message`, Cron) and one collapsible best-effort Monitoring Turn slot (Heartbeat, Perception Event). Wraps the in-memory ordering queue (ADR-0007); owns the transactional ingress commit (ADR-0009). Consumes a **Bound Session** on `accept`.
_Avoid_: job queue, session writer, durable queue

**Perception Event**:
A perception event pushed by the Desktop over the Protocol — the Runtime does not poll for it — summarizing what the User is doing while raw media remains local. New Desktop events carry `window_id`; already-queued legacy events without it still ingest and acknowledge but never enter a Coaching Turn. As an inbound push it enters the **Per-User Channel** like a `user_message`; a rapid burst collapses to one pending Monitoring Turn. Detailed permitted evidence lives only in expiring `perception_records`; the immutable `runtime_events` ledger retains ordering and dedupe metadata, not the summary, OCR, transcript, or signal body. Perception is not appended to the brain's thread, written to Conversation History, or rendered as chat. Distinct from **Session Snapshot** (reconnect history) and **Checkpoint** (LangGraph turn state).
_Avoid_: screen log, activity event (too generic), telemetry ping

**Sensory Buffer**:
The Companion's bounded recent-perception view for one active **Desktop Coaching Window**, assembled on demand by joining durable ordering metadata to the current expiring `perception_records` projection. Before a Coaching Turn executes, the reader fixes an upper cursor and renders the oldest unconsumed eligible records up to 32 events and 12,000 characters. Current projection truth wins: expired and tombstoned rows disappear, while redaction re-emits replace their earlier permitted body. A successful turn advances only through the last included cursor; failed turns advance nothing, and unchanged evidence never causes another model call. Older search uses `perception_records` and `search_screen_context`. The buffer is not curated **Per-User Memory**, and detailed perception is never copied verbatim into durable memory.
_Avoid_: snapshot table, sensory_buffer table

**Unified Working Context**:
The single per-user reasoning context the brain operates over — the tier-1 LangGraph thread checkpoint (conversation + prior monitoring judgments + temporal grounding) **plus** the injected **sensory buffer** of recent Perception Events **plus** tier-2 durable memory. One brain, one context, fed by every source. The DeepAgents two tiers are **time horizon** (recent working context vs durable long-term memory), **not source** (chat vs screen). There is no second isolated context; splitting it would split the brain. See ADR-0014.
_Avoid_: chat context (too narrow), perception thread, isolated session

## Relationships

- The **Persistence Adapter** wraps LangGraph's Postgres checkpoint store.
- The `runtime/` and `memory/` domains depend on the **Persistence Adapter** interface, not on LangGraph types.
- **Checkpoints** are written by LangGraph via the **Persistence Adapter** on every DeepAgents step within a turn.
- The **Unified Working Context** is fed by every source (user messages, Perception Events, temporal grounding); the shell delivers reality and executes actions but never judges intervention.
- The **Per-User Channel** is the single run-loop for main-checkpoint triggers (`user_message`, Cron fire, Perception Event, Heartbeat tick). Cron records fire idempotency and run history and enqueues onto the Channel's committed lane on the main thread (ADR-0029).
- One process-wide **scheduler** holds cron due-times (Neon `next_fire_at`) and Heartbeat due-ness (computed from `agent_instances` + latest `runtime_turns`; no heartbeat table). Both enqueue onto the Per-User Channel — Cron on the committed lane, Heartbeat on the best-effort lane (ADR-0018, ADR-0027, ADR-0029).
- The **Procedure Floor** (`SOUL`/`AGENTS`/`BOOTSTRAP`/`HEARTBEAT`) is versioned product content in the Langfuse `intentive-runtime-bundle`, injected per turn — not resolved from the VFS (ADR-0021/0022).
- **Per-User Memory** (`USER.md` + `/memories/`) lives in the DeepAgents `StoreBackend` over Neon, namespaced `(user_id,)`; `USER.md` is injected, `/memories/` is read on demand. Nothing shadows a Procedure Floor document (no overlay merge in v1).
- Procedure-floor content is a product concern (authored/versioned in Langfuse); per-user memory content is authored by the agent. The shell injects the floor + `USER.md` and otherwise lets DeepAgents own the memory filesystem.

## Flagged ambiguities

- "checkpoint" vs "snapshot" — resolved: **Checkpoint** is LangGraph turn state; **Perception Event** is the Desktop's screen-capture summary event; **Session Snapshot** is the reconnect history projection. Three unrelated concepts that all once read as "snapshot."
- "session" must never mean the conversation/transcript — resolved 2026-06-13. The continuous companion conversation is **Conversation History** owned by the **Agent Instance**, not a "session." The only legitimate qualified uses of "session" are **Bound Session** (the authenticated WebSocket connection), **Capture Session** (the Desktop screen-capture period ended by `session_end_marker`), and **Session Snapshot** (the reconnect history projection). OpenClaw's conversation-`session`/`sessionId` concept (with daily/idle reset) does **not** exist in our system — see the "one eternal conversation" decision below.
- `hello_ok.session_snapshot` was typed `z.unknown()` in `packages/protocol` — resolved to the **Session Snapshot** shape above and implemented as explicit `session_message`/`session_snapshot` Zod schemas (see ADR-0006).
- "overlay-first read resolution" implied a per-read merge of Bundle Default + User Overlay — resolved 2026-06-15 (ADR-0021): in v1 no path has both (procedure floor injected, memory store-only), so the merge never fires. "Resolution" is static routing by path-kind, not a merge; the general merge engine is deferred with agent self-personalization (ADR-0005).
- "monitoring" must never imply a separate brain or shell-side judgment. The **Monitoring Turn** remains one main-session agent turn (ADR-0015), but monorepo ADR-0006 now structurally gates v1 turns on an active **Desktop Coaching Window**. Perception and the active-window Heartbeat only create judgment opportunities. Avoid "monitoring loop/system," "saliency gate," and "snapshot message."
- "Heartbeat quiet-hours" and "dormancy backoff" are no longer v1 product questions. Monorepo ADR-0006 supersedes ADR-0027's flat forever/offline floor: outside a Desktop Coaching Window no proactive model call occurs; inside one, the active floor targets a judgment opportunity within two minutes while the agent still owns interrupt-or-stay-silent.
- **Post-Message-Back delivery** keeps one shared delivery port and unified append-only `deliveries` ledger (ADR-0028), but monorepo ADR-0006 sets the v1 chat-capable predicate to `{desktop}`. Interactive replies require a connected Desktop; proactive presentation additionally requires the matching active Coaching Window. V1 never falls back to mobile push.
- "Observability / Safety / Production Readiness" (#42) read as a custom program — metrics pipeline, dashboards, SLOs, rate-limiting, circuit breakers, safety gates on the agent — resolved 2026-06-16. v1 production readiness is **off-the-shelf + existing bounds, not a built program** (the industry-standard three-layer split): **Langfuse** = behavioral/eval layer ("what did the agent see/decide", already wired, ADR-0012/0022); **Sentry** = error/health layer (exceptions, crashes, alerting — installed, not built); **structured logs at the seams** (connection, queue, turn, VFS, Cron, Heartbeat, push) = the operator's step-by-step trace. **Cut from v1:** custom metrics infra (Prometheus/Grafana), dashboards, SLOs — those metrics ride as fields in the structured logs (token usage already in Langfuse) until load demands more. **No hard-coded behavior rules** (push caps, fixed quiet-hours, daily limits): agent behavior is shaped by Langfuse + the procedure floor, never if-statements (this would reverse ADR-0027's agent-judged quiet-hours; it is the feature-parity-with-traditional-software trap). The "don't fire 200 notifications for one decision" **fault** case is **already covered** — delivery is fire-once per `post_message_back` (ADR-0028) and a single turn is step-bounded by the LangGraph engine; no custom breaker is built (if abuse appears, Langfuse surfaces it and we revisit). **"One user sinks everyone"** per-user resource quotas are also deferred (a load problem, not a v1 problem); the cheap **multi-user isolation test** stays because it guards a correctness/privacy property, not capacity. Wiring note: Sentry is initialized through `packages/providers/src/observability/` with `skipOpenTelemetrySetup: true`; `SENTRY_MODE=errors-only` and `LANGFUSE_MODE=callback` are the only wired v1 modes, with future OTel/performance modes reserved in that one module. See ADR-0030.
- "capture live" and "coach present" are separate. `session_end_marker` remains a capture/archive durability fact. Monorepo ADR-0006 adds explicit `coaching_window_started` / `coaching_window_ended` lifecycle and a small shell-owned projection for whether v1 proactive coaching is permitted. That presence boundary is not a Work-State Judgment: the shell knows whether the coach is in the room; only the Companion judges what the User's work means.

## Decisions

**Persistence Adapter is a thin wrapper (not direct LangGraph coupling)**
Decided 2026-05-29. Shell domains import the Persistence Adapter interface; LangGraph checkpoint types stay inside the adapter implementation. This keeps the `runtime/` and `memory/` domains free of LangGraph internals and makes the store swappable without touching domain code. Alternatives considered: DIY Postgres checkpoint tables (too much duplicated logic) and raw LangGraph store usage in domain code (too coupled to LangGraph internals).

**v1 Bundle Path Set is locked to six paths**
_Superseded 2026-06-15 by ADR-0021._ The "six paths in one VFS" framing is replaced by two things: an **injected procedure floor** (`SOUL.md`, `AGENTS.md`, `BOOTSTRAP.md`, `HEARTBEAT.md` — versioned product content composed into the system prompt by the prompt-assembly middleware, **never** routed into the agent's filesystem) and a **per-user memory namespace** (`USER.md` profile + a `/memories/`-style folder the agent manages) exposed to the agent via the native DeepAgents `CompositeBackend`'s `StoreBackend` route over Neon. The original text below is retained for history.

Decided 2026-05-29. The `bundles/` domain resolves exactly these paths at session start: `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`, `USER.md`, `MEMORY.md`. All six are seeded as empty Bundle Defaults on first deploy. `USER.md` and `MEMORY.md` are User Overlay paths — DeepAgents writes their content over time via the VFS backend; the shell does not author them. `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, and `HEARTBEAT.md` are Bundle Defaults whose content is a product concern, authored and versioned separately from the shell build.

**VFS write policy: procedure files immutable, knowledge files writable**
_Refined 2026-06-15 by ADR-0021._ Procedure files are **not routed into the agent's VFS at all** — immutability is **structural** (the agent cannot see or write them), so the "reject writes" guard is unnecessary and dropped. The procedure/knowledge distinction below stands; only its enforcement mechanism changed.

Decided 2026-05-29. The VFS backend splits the path set into two buckets by what the file _is_:

- **Procedure (immutable in v1):** `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`. These define how the Companion reasons and behave as the centrally-controlled product floor. Agent writes to these paths are **rejected** — they are not routed to overlays. This preserves the ability to ship a fixed/improved bundle version (e.g. from Langfuse eval signal) to all users, including existing ones, without a user overlay shadowing the update.
- **Knowledge (agent-writable overlays):** `USER.md`, `MEMORY.md`. The agent writes learned, personal facts here over time. These are User Overlays with no Bundle Default to shadow.

Personalization in v1 expresses through the knowledge layer plus **Cron** (scheduled actions), not by the agent editing its own procedure files. This includes **what the Companion watches for**: the agent "programs its own monitoring" by writing per-user **watch-items** into the writable knowledge layer (`MEMORY.md`), _not_ by editing `HEARTBEAT.md`. `HEARTBEAT.md` stays the immutable procedure for _how_ to run a Monitoring Turn; `MEMORY.md` carries the personal watch-list of _what_ to watch. A Monitoring Turn reads both. Worked example: the agent learns "user takes a pill ~9pm" → writes the fact (and any "watch for evening-routine drift" watch-item) to `USER.md`/`MEMORY.md`, creates a Cron job to fire at 9pm; `HEARTBEAT.md` is read (never written) to decide whether a given tick is worth a Post-Message-Back. See ADR-0015.

**Bundle version is pinned per WebSocket connection**
_Source resolved 2026-06-15 and tightened 2026-07-26 by ADR-0022:_ the procedure floor is managed only in **Langfuse Prompt Management**; pinning = resolve the `production` label once at `hello_ok`, hold it for the connection, and re-resolve on reconnect. `runtime_turns.bundle_version` records the resolved Langfuse bundle version. The Runtime requires Langfuse configuration and fails closed if `intentive-runtime-bundle` cannot be fetched and validated; it never substitutes a deploy-owned prompt floor.

Decided 2026-05-29. The Pinned Bundle Version is resolved once at `hello_ok` (from the then-latest version) and held fixed for the connection's lifetime; every turn on that connection resolves Bundle Defaults against it. A reconnect is the migration boundary — it re-resolves to whatever is latest at that moment. The resolved version is written to each `runtime_turns` row so "which bundle produced this behavior?" is always answerable (matters for the Langfuse eval loop). This honors ADR-0004's "migrate at reconnect, never mid-turn" boundary. Alternatives rejected: per-turn pinning (risks behavioral drift within one conversation) and explicit `agent_instance`-level migration jobs (more control than v1 needs; can strand users on stale bundles).

**Agent-driven behavioral self-personalization is deferred to its own ADR.** Letting the agent overlay procedure files (`AGENTS.md`/`HEARTBEAT.md`) is a hard, near-irreversible mechanism entangling override-vs-augment semantics, base-version migration, and the safety floor. It must not be a silent Phase 0 default. When built, it should be **augment** (base always loaded, learned layer composed on top) rather than **replace** (overlay shadows base), so central bundle improvements still reach personalized users.

**Runtime durable state is three separate concerns, not one store.**
Decided 2026-06-09. Everything the Runtime persists lands in Neon, but it splits into three storages with different access patterns and guarantees, and they are never conflated:

- **Event / conversation log** — relational tables (`runtime_events` ledger, `conversation_messages`). Needs per-`user_id` time-ordering and unique-constraint idempotency. Shell-owned. This is the OpenClaw transcript equivalent.
- **Agent document workspace (VFS)** — **Per-User Memory** (`USER.md`, `/memories/`) exposed to DeepAgents as a virtual filesystem (`ls`/`read`/`write`/`edit`/`glob`/`grep`) over the **native DeepAgents `StoreBackend`** (a `PostgresStore` on Neon, namespaced `(user_id,)`) — _not_ a hand-rolled backend (ADR-0021). The OpenClaw workspace-files equivalent.
- **Agent mid-turn state (Checkpoints)** — opaque per-step serialized state, managed by the **Persistence Adapter** over LangGraph's Postgres checkpoint store.

The event log is deliberately **not** a VFS file: idempotency (unique constraint) and ordering are relational powers a path-keyed store cannot give, and they are exactly what the per-user serialization invariant depends on. OpenClaw splits the same way (transcript dir vs workspace files vs agent state); we back all three with Neon instead of local disk. `runtime_events` (#28) touches only the first concern.

This grouping is by **storage family** (relational, Neon, shell-owned), **not** by module ownership. Within the event/conversation log family, `runtime_events` and `conversation_messages` live in **different domains** because they hide independently-varying decisions: `sessions` owns ordering + idempotency (`runtime_events`), and `conversation` owns the readable transcript + Session Snapshot projection (`conversation_messages`). See ADR-0008. Do not read "one storage family" as "one domain."

**Prompt assembly: eager-inject the procedure floor via trigger-aware dynamic middleware; read knowledge on demand via the VFS.**
_Clarified 2026-06-15 (ADR-0021/0022)._ The only per-turn injections are the **procedure floor** (now sourced from Langfuse, ADR-0022) and the OpenClaw-style **USER.md profile** (a `StoreBackend` file the shell reads + injects, kept compact by instruction). **All other memory is DeepAgents-native:** the agent reads/writes its `/memories/` folder on demand via DeepAgents VFS tools over the `StoreBackend`; the **shell does not auto-load memory** (honoring the reference invariant "do not implement LTM in the shell — DeepAgents owns it"). OpenClaw's shell-side auto-load / distillation / decay are **not** ported; that shape, if wanted, is agent behavior driven by the procedure floor, not shell machinery.

Decided 2026-06-13. DeepAgents owns the _mechanism_ (system-prompt assembly, skills progressive disclosure, VFS read tools); Intentive's `bundles`/`memory` domains own the _content + overlay resolution_ and feed a **dynamic prompt middleware**. The split follows the existing procedure/knowledge line (ADR-0005):

- **Eager-injected** into the per-turn system prompt: the procedure floor (`SOUL.md`, `AGENTS.md`), the compact `USER.md` profile — composed by a middleware that is **trigger-aware** (`HEARTBEAT.md` on perception/heartbeat turns, `BOOTSTRAP.md` on first run).
- **Read on demand** via DeepAgents VFS tools over the native `StoreBackend` on Neon: the `/memories/` namespace — progressive disclosure that keeps an unbounded memory from blowing the window.

The prompt the model sees is assembled **per turn, per user, per trigger** — not a static string. Mirrors OpenClaw's hybrid (inject `SOUL`/`AGENTS`, read memory on demand) using DeepAgents-native mechanisms, so it does not fight the library. (**v1 has no skills** — see the next decision; when skills land they slot into this same eager-list / read-body-on-demand shape.)

**v1 has no skills and no subagents.**
Decided 2026-06-13. The v1 Companion is a **single brain** (ADR-0014) with the locked bundle files, the minimal all-internal tool surface (`post_message_back` plus DeepAgents' built-in filesystem/VFS — which carries both memory _and_ cron cards), monitoring, and cron — nothing more. We deliberately ship **no skill library** and **no subagent delegation** in v1.

- **No skills.** When skills _do_ arrive (post-v1), they are **immutable progressive-disclosure md files** — central, shipped, versioned like the procedure floor (ADR-0005), **not** agent-authored. The agent cannot build its own skills in v1; that may change after v1 but is not a v1 default. The prompt-assembly shape above already reserves the slot (eager skill _list_, read _body_ on demand) so adding them later does not disturb the design.
- **No subagents.** No delegated isolated workers in v1. DeepAgents supports subagents natively, so this is a _deferral_, not a missing capability — added when a concrete need appears (e.g. a heavy background chore alongside the deferred isolated cron, ADR-0017).

This keeps v1 minimal and avoids speculative machinery; both are DeepAgents-native when needed, so deferring costs us nothing. See ADR-0019.

**Single unified brain — the shell is senses and hands, the agent owns intervention judgment.**
Decided 2026-06-13. The Companion is a real-time body-double, so it must be continuously grounded in reality and judge for itself when to intervene:

- **One unified working context.** User messages and Perception Events feed the _same_ tier-1 working context and _same_ tier-2 durable memory. The two DeepAgents tiers are **time horizon**, not source. Proactive/perception runs are **not** isolated — isolating them would split the brain, and an exocortex must not fragment its own memory.
- **The shell is senses + hands, never a judge.** Senses: faithfully deliver reality (every Perception Event + temporal grounding); transduce raw device signals, never decide salience. Hands: execute the agent's chosen actions. No shell-side saliency gate.
- **The agent owns intervention judgment.** Every snapshot is a real agent turn; the agent decides silent-vs-act itself and acts only by calling an egress tool (Post-Message-Back). Its silent-vs-act choice is the only gate, and it is the agent's.
- **Display boundary ≠ brain boundary.** Snapshots feed the brain but are not rendered as chat; `conversation_messages` stays chat-only. One brain that sees all; one clean chat timeline.

Cost note: this means a full agent turn per snapshot per user — a scale concern to be solved by **agent-controlled cadence** later, never by returning judgment to the shell. See ADR-0014.

**Monitoring is one mechanism (a Monitoring Turn in the main session) with two triggers; `HEARTBEAT.md` stays immutable.**
Decided 2026-06-13. We do **not** reinvent monitoring. OpenClaw's heartbeat is a periodic agent turn in the **main session** — not a separate brain — and a Perception Event is _part of_ that same monitoring mechanism, not a redundant second one. So:

- **One mechanism: the Monitoring Turn.** A real agent turn on the Unified Working Context whose job is "should I intervene right now?" It runs in the main session (same brain, ADR-0014), reads the immutable `HEARTBEAT.md` procedure plus the user's `MEMORY.md` watch-list plus the injected sensory buffer, and either stays silent or calls `post_message_back` (egress default, ADR-0013).
- **Two triggers, same turn.** (1) **Heartbeat** — a periodic timer tick; (2) **Perception Event** — a perception event arriving from a device. Either fires the _same_ Monitoring Turn. They are not two systems.
- **Snapshots arrive via a sensory buffer, not as thread messages.** The shell accumulates recent Perception Events in a shell-maintained **sensory buffer** and injects it into the Monitoring Turn; the unit that enters the thread is the _one judgment per wake_, not each raw snapshot. (This reverses the earlier "snapshot-as-message" leaning.) Raw-snapshot archival for audit/replay is optional and served by Langfuse traces.
- **`HEARTBEAT.md` is immutable procedure (how to monitor); the watch-list is writable knowledge (what to watch).** The agent programs its own monitoring by writing watch-items to `MEMORY.md`, never by editing `HEARTBEAT.md` — preserving the centrally-improvable safety floor (procedure/knowledge split, consistent with the Bundle Path Set decision above and ADR-0005). Making `HEARTBEAT.md` agent-writable was considered and **rejected** for v1 (it drops the safety floor and reopens deferred self-personalization).
- **Cron is separate.** Cron is absolute-time scheduled action, a distinct primitive from the periodic/perception-driven Monitoring Turn.

See ADR-0015.

**The Per-User Channel is the single run-loop; trigger arbitration is FIFO user turns + collapsing Monitoring Turns + prioritized cron.**
Decided 2026-06-13. One brain + one eternal thread (ADR-0011/0014) means exactly **one checkpoint per user**, so two agent turns can never run against it concurrently. Rather than invent a lock, we promote the **Per-User Channel** (already the per-`user_id` ordering/ingress point) into the **single run-loop**: every trigger is arbitrated there and exactly one turn runs at a time. This mirrors OpenClaw, whose `SessionKey` is "the bucket key used to store context _and control concurrency_," with per-session FIFO and skip-when-busy heartbeats — we adapt, not reinvent.

_Amended 2026-06-16 (ADR-0029):_ with Post-Message-Back egress shipped, Cron **rejoins the Per-User Channel** and runs as a **main-thread** turn like the other triggers (retiring the issue #39 silent `cron:…` ephemeral-thread stopgap). Arbitration is **two classes**: _committed_ (`user_message`, cron fire) and _best-effort_ (heartbeat, snapshot).

- **`user_message` (committed):** enqueue, strict **FIFO, never dropped**; a rapid burst is **debounced** into one turn (OpenClaw's "debounced batch").
- **Cron fire (committed):** enqueue onto the Channel, **never dropped**, run **FIFO** on the **main thread** — a Cron is a promise, so it cannot be collapsed or skipped. It does **not** jump ahead of pending `user_message`s (a user typing must not wait behind a cron); ADR-0016's "with-priority" means priority over best-effort triggers, not over interactive ones. Lifecycle (reschedule/delete/transient-retry/`cron_runs`) rides the turn's `onSuccess`/`onFailure` hooks unchanged; retry now covers only turn-execution errors since contention makes a fire _wait_, not fail (ADR-0029).
- **Perception Event (best-effort):** append to the **sensory buffer** and ensure **at most one pending Monitoring Turn**; a burst collapses into the buffer (ADR-0015), never one turn per snapshot.
- **Heartbeat tick (best-effort):** **skip-when-busy** — if the lane is busy or a Monitoring Turn is already pending, the tick is **dropped** (not queued); the next tick re-evaluates fresh state. This is OpenClaw's actual mechanism and is simpler than coalescing stale ticks.

Net invariant: **committed triggers (user_message, cron) never collapse and are never dropped (FIFO); best-effort triggers (heartbeat, snapshot) collapse to at most one pending Monitoring Turn and always reason over the latest buffer + state; in-flight turns are never preempted.** See ADR-0016 and ADR-0029 (the cron→main-session flip that retires the ADR-0017 v1 exception).

**Issue #39 Cron fires silently on an ephemeral thread; main-session delivery returns with Post-Message-Back (#41).**
Amended 2026-06-16. For the first Cron slice the ADR-0017 main-session leaning was superseded: a due Cron hydrates the Procedure Floor, `USER.md`, and recent perception, invokes DeepAgents with `trigger: "cron"` on an ephemeral thread, records `cron_runs`, and applies lifecycle/retry updates — appending no Conversation History and not mutating the main checkpoint, so undelivered reminder attempts could not pollute the eternal thread before egress existed. **Flip shipped 2026-06-16 (ADR-0029, #41):** Cron enqueues onto the Per-User Channel and runs on the **main thread** in the **committed/FIFO** class (never dropped, never ahead of `user_message`), can `post_message_back`, and drops the `cron:…` ephemeral thread. The scheduler still owns due-ness (poll loop, ADR-0024) and cron lifecycle; only the execution path moves onto the Channel.

**Agent Instance lifecycle: agents live as data, wake on demand, and sleep when quiet.**
Decided 2026-06-13; v1 proactivity amended 2026-07-26 by monorepo ADR-0006. "Always-alive" means the server remains deployed — **not** a brain-per-user and not 24/7 user-facing coaching. One VM serves many users, so we do not hold a live brain for every user.

- **Logical instance (lives as data).** The durable truth is Neon — checkpoint + bundles + memory + Conversation History. There is no resident per-user brain; the Agent Instance is a row (see term above).
- **Session Start is infrastructure only.** It synchronously creates or loads that row and returns Routing. It never invokes DeepAgents or emits a welcome.
- **First-run personalization begins at a real user surface.** The first eligible Opening Orientation and the following successful Interactive Turn receive `BOOTSTRAP`; completion is durable on the Agent Instance and survives reconnect, Desktop close, and Runtime restart (ADR-0036).
- **Lazy hydration (wakes on demand).** When a main-thread trigger fires for a user — a `user_message`, a Cron fire, a Perception Event, or a Heartbeat wake — the runtime builds that user's brain in memory _then_, by hydrating the checkpoint, and runs the turn on the Per-User Channel (ADR-0016).
- **Idle eviction (sleeps when quiet).** After the user goes quiet, the in-memory brain is dropped to free resources; nothing is lost because state is in Neon. The next trigger re-hydrates from scratch.
- **One process-wide scheduler remains infrastructure.** Cron machinery may retain due-times, but Cron-originated interruption is dormant in v1. Heartbeat due-ness is considered only for Users with an active Desktop Coaching Window and enqueues on the best-effort lane.
- **Perception is the primary active-window trigger.** The active Heartbeat is only the simple under-two-minute floor when perception has not already created a Monitoring Turn. Outside the Coaching Window neither path proactively calls the model.
- **Restart-resumable.** Neon-persisted checkpoints survive a VM restart; an in-flight turn resumes from its last checkpointed step (Persistence Adapter). The scheduler holds **no in-memory timer wheel to rebuild** — on each tick the poll loop simply queries Neon for due jobs (`next_fire_at <= now()`), so anything that came due during downtime is found on the first tick after boot and fired in a **controlled, non-stampeding** way.

See ADR-0018.

**DeepAgents-native memory: the thread checkpoint is the model's working memory; `conversation_messages` is the client/eval record.** (Supersedes the earlier "transcript is authoritative" decision; see ADR-0010 → ADR-0012.)
Decided 2026-06-13. Both OpenClaw and DeepAgents are battle-tested; the rule is to pick whichever is simpler and does not fight the tool we committed to. We committed to DeepAgents as the brain, so we use its **native two-tier memory** rather than porting OpenClaw's transcript-rebuild:

- **Model working memory (cross-turn)** = the LangGraph **thread checkpoint** (`thread_id` per user), carried natively across turns and bounded by DeepAgents' **summarization/offloading middleware**. We do not rebuild context from `conversation_messages`, and we do not hand-persist compaction summaries — the compacted state lives in the checkpoint.
- **`conversation_messages`** = a **parallel durable record** for client reads (Session Snapshot, History Backfill) and as the eval anchor, dual-written per turn. It is **not** the model's memory; the checkpoint is opaque, so clients need this queryable transcript regardless.
- **Long-term curated memory** = **Per-User Memory** (`USER.md` + `/memories/`) via the **native DeepAgents `StoreBackend`** over a `PostgresStore` on Neon, namespaced `(user_id,)` (the docs' Postgres-VFS pattern). The shell only wires the native backend + namespace — it does **not** hand-roll a `BackendProtocolV2` (corrected by ADR-0021).
- **"What did the model see on turn N?"** is answered by **Langfuse traces** (actual per-turn model input), not by replaying the transcript.

Risk parked to Phase 11: with one eternal thread per user (next decision), that thread is summarized indefinitely — summary-of-summary drift is a retention concern, not solved here.

**Egress is explicit DeepAgents tools + trigger-type default — not shell-side output classification.**
Decided 2026-06-13. The shell does **not** inspect the agent's final message and guess "silent / reply / Post-Message-Back." Instead:

- **Trigger type sets the default.** An **interactive** turn (`user_message`) delivers the agent's returned final message as the reply. A **proactive** turn (cron fire, heartbeat tick, context snapshot) is **silent by default** — the returned text is internal reasoning and is not delivered.
- **Proactive user-facing output happens only via the Post-Message-Back tool.** Self-scheduling needs **no bespoke tool**: the agent writes a **cron card** with the built-in filesystem tools (`write_file`/`edit_file`/`ls`) into a reserved `/crons/` route backed by `cron_jobs`. The shell-side write-route validates the schedule (croner + 5-min floor) and computes `next_fire_at`. Post-Message-Back stays an explicit tool because egress has external blast radius and must be auditable; scheduling does not.
- We **drop** OpenClaw's sentinel-string classification (`HEARTBEAT_OK` / `NO_REPLY`): silence is simply "no egress tool called on a proactive turn," so no string parsing is needed.

This supersedes the implementation plan's "treat DeepAgents output as a candidate; the shell decides silent / normal reply / Post-Message-Back" language (Phase 5 step 6, Phase 10). See ADR-0013.

**v1 tool surface is minimal and all-internal; the permission/approval model is deferred until tools gain external blast radius.**
Decided 2026-06-13. The v1 Companion _perceives, remembers, talks, and schedules_ — it has no hands on the outside world yet. The tool set is exactly:

- `post_message_back({ body })` — the one proactive egress (the agent's only path to a user-facing message on a proactive turn). **Content only** — server mints `message_id`, stamps `emitted_at`, forces `via_post_message_back = true`; no transport hint. Handler **persists first**, then delivers via the shared delivery port (foreground chat-capable client ⇒ stream, else ⇒ CP push), recording the attempt in the unified `deliveries` ledger. See **Delivery**, ADR-0028.
- DeepAgents' **built-in** VFS tools (`read`/`write`/`edit`/`ls`/`grep`/`glob`) over the native `StoreBackend` on Neon for memory plus the custom `/crons/` backend for **cron cards** — the agent _schedules itself_ by writing a card, not by calling a custom tool. Native file I/O, no bespoke cron CRUD verbs (ADR-0026).

Deliberately **absent in v1**: web search, code/shell exec, calendar/email writes, arbitrary HTTP. Because no v1 tool has dangerous external side effects, there is **no per-call approval gating** — all registered tools are allowed, and audit is just **tracing every tool call** (Langfuse + structured logs) plus the durable Post-Message-Back record. A trust-tier/approval model is built **later**, when the exocortex grows real-world hands (writing the user's calendar, sending on their behalf, spending money); building it now would be speculative.

**One eternal Companion conversation per user — no conversation reset in v1.**
Decided 2026-06-13. There is a single continuous **Conversation History** per `user_id`; `conversation_messages` is one unbroken stream, never segmented into per-conversation transcripts and never wiped. We deliberately **do not** adopt OpenClaw's `/new`, daily-reset (4am), or idle-expiry rollover into a new `sessionId`. The product is an always-on companion relationship, not discrete task sessions, and **compaction** (not reset) bounds context growth. This is a deliberate OpenClaw divergence under ADR-0001 and is consistent with ADR-0001's "one active continuous session per user." No user-initiated "start over" or forget seam is reserved in v1. See ADR-0011.

**Ingress ack is decoupled from turn success; turn failures are contained, not thrown.**
Decided 2026-06-14. The **Interactive Turn** runs inside the same Per-User Channel task as ingress (`txn{ledger + user-msg}` → `invoke` → `txn{companion append + runtime_turns}`). An **ingress-transaction** failure rejects `accept` (the message was not durably accepted); a **turn** failure (invoke/append) is **caught**, recorded as `runtime_turns(status = failed)`, and `accept` **resolves** — silent to the user, loud in the **Runtime Turn** record and logs, never thrown out of the lane (which would falsely signal ingress failure and leak an unhandled rejection out of `user-queue.ts`). No auto-retry in v1; crash-mid-turn resume is the checkpoint concern of ADR-0018. See ADR-0020.
