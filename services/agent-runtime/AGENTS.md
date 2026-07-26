# Agent Runtime — Agent Guide

The always-alive, multi-tenant service that runs **Companion** behavior. Built on **DeepAgents** (LangChain TypeScript: `langchain-ai/deepagentsjs`).

**Read first:** [`CONTEXT.md`](CONTEXT.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CHANGELOG.md`](CHANGELOG.md), [`docs/adr/README.md`](docs/adr/README.md), root [`AGENTS.md`](../../AGENTS.md) Start here, and [`reference/AGENTS.md`](reference/AGENTS.md) when implementing shell domains.

## Role in V1

- Hosts every user's **Agent Instance** (logical, shared compute, scoped by `user_id`)
- Accepts WebSocket connections from clients (Mobile, Desktop, future Android) per **Protocol** schemas in `packages/protocol/`
- Runs DeepAgents loops, executes tools, manages compaction, owns memory
- Drives **Cron** and active-window **Heartbeat** triggers; decides when to **Post-Message-Back**
- Projects Desktop Coaching Windows and admits Opening/Monitoring work only for
  a matching connected, actively attested Desktop
- Owns **Conversation History** (server-truth) and runtime memory in Neon
- Exposes **Internal API** (`POST /internal/sessions/start`) to the Control Plane

## Domains

Each lives under `src/domains/<name>/{types,config,repo,service,runtime,ui}/`:

- `gateway` — WebSocket server, connect handshake, JWT verification, protocol enforcement
- `sessions` — the Per-User Channel: per-user serialization point for ordering,
  idempotency, transactional ingress, queue-serialized Conversation History
  reads, **Interactive Turn** dispatch, and lifecycle/perception hooks. The
  legacy **Sensory Buffer** remains for non-coaching trigger families.
- `perception` — expiring current Rewind projection and hybrid recall; detailed
  evidence lives here rather than in the immutable event ledger. Embedding
  enrichment runs outside the turn lane and compare-and-sets against the exact
  projected content.
- `coaching` — default-off founder feature gate, durable Coaching Window
  projection, fixed privacy-safe recent-evidence reader, committed Opening
  Orientation, and the single `MonitoringCoordinator`
- `conversation` — durable Conversation History transcript (`conversation_messages`), Session Snapshot projection (`readSnapshot`), history backfill reads (ADR-0008)
- `protocol` — inbound/outbound event handling (every event type in `packages/protocol/`)
- `runtime` — DeepAgents adapter (`repo/deep-agents-adapter.ts`), shared **Turn Execution** spine (`service/turn.ts` + `service/working-context.ts`; ADR-0031 resolves `floor()`, revalidates coaching commits, and appends exactly one `runtime_turns` anchor per turn), **Interactive Turn** runner, **Monitoring Turn** builder, and durable Runtime Turn metadata
- `delivery` — shared delivery port, process-local connection registry consumer,
  ordinary interactive routing, matching-window Desktop-only coaching routing,
  Post-Message-Back service/tool, and `deliveries` ledger. Coaching never falls
  back to Control Plane push.
- `cron` — scheduled-trigger primitive: `/crons/` filesystem cards backed by `cron_jobs`, poll scheduler, Per-User Channel committed enqueue, and `cron_runs`
- `heartbeat` — 120-second active-window trailing floor over
  `coaching_windows`; enqueues best-effort **Monitoring Turns**
- `memory` — DeepAgents-native Per-User Memory: `StoreBackend` over Neon plus the `/memories/` VFS route and injected `USER.md` profile
- `bundles` — Procedure Floor resolution and prompt assembly: the canonical
  Langfuse `intentive-runtime-bundle` `production` prompt is required and
  validated fail-closed; coaching behavior lives in `AGENTS`, Monitoring Turns
  additionally receive `HEARTBEAT`, and callers may supply fixed
  `RECENT_PERCEPTION`
- `internal` — server-to-server API surface (Session Start)

## Stack & deploy

- Node / TypeScript + LangChain DeepAgents
- Boot config: `src/config/env.ts` (`loadConfig`) — the only place that parses `process.env`; requires `OPENROUTER_API_KEY`, Langfuse keys plus explicit regional base URL, Control Plane outbound push settings, and internal Runtime ingress settings; Sentry remains optional (`LANGFUSE_MODE` and `SENTRY_MODE` select integrations); observability bootstrap via `@intentive/providers/observability` at `main.ts` only (ADR-0030); see [`.env.example`](.env.example) and `test/config-env.test.mjs`
- Desktop coaching is default-off and additionally founder-scoped by
  `DESKTOP_COACHING_V1_ENABLED` and
  `DESKTOP_COACHING_V1_FOUNDER_USER_IDS`. Lifecycle projection remains
  backward-compatible while disabled.
- Domain folders are **lazy** (ADR-0002): add `src/domains/<name>/…` only when implementing that slice, not empty layer trees upfront
- Deploys to **Google Compute Engine** VM (Container-Optimized OS), one always-alive process serving all users
- Reads Neon Postgres via runtime-owned schema (separate role from Control Plane); SQL migrations live in `migrations/`
- Tests: `pnpm --filter ./services/agent-runtime test`; repo-tier Neon integration tests skip unless `NEON_API_KEY` and `NEON_PROJECT_ID` are set; harness: `pnpm harness --scope services/agent-runtime`. See [`../../docs/TESTING.md`](../../docs/TESTING.md) and `test/*.test.mjs` for domain coverage.
- Release runbook (SHA-identified in-place VM swap): [`docs/RELEASE.md`](docs/RELEASE.md). Production state: [`../../docs/PRODUCTION.md`](../../docs/PRODUCTION.md).
- Local dev / smoke: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) runs the real service (WS gateway, turn spine, cron + heartbeat) against an **isolated Neon dev branch** (tag it and say "run the agent runtime" / "kill it"). Full four-deployable stack + live `user_message` → companion reply: [`../../docs/DEVELOPMENT.md`](../../docs/DEVELOPMENT.md) (`scripts/local-stack.sh`). Domain SQL migrations apply via `pnpm --filter ./services/agent-runtime migrate` (for an empty branch; a forked branch already carries the schema).
- Plans: [`docs/plans/agent-runtime-v1-implementation-plan.md`](docs/plans/agent-runtime-v1-implementation-plan.md)

## Child Index

- [`reference/AGENTS.md`](reference/AGENTS.md) — OpenClaw/Hermes pattern packs and DeepAgents production guidance for shell domains.

## Reference patterns

The [`reference/`](reference/) directory contains OpenClaw and Hermes pattern packs as **input** — not architecture to copy verbatim. Use them when implementing gateway, sessions, cron, channels, heartbeat, memory, hooks, workspace, etc. Always read the topic card under `reference/topics/` first; raw `*-llms.txt` is a fallback.

LangChain Deep Agents production guide (load before changing memory, backends, or guardrails): [`reference/topics/going-to-production.md`](reference/topics/going-to-production.md) → [`reference/deepagents/going-to-production.md`](reference/deepagents/going-to-production.md). Upstream: [Going to production](https://docs.langchain.com/oss/python/deepagents/going-to-production#user-recommended).

## Cron operations

Agent-authored scheduling only — no shell cron CRUD tools ([ADR-0026](docs/adr/0026-agent-runtime-cron-is-deepagents-native-filesystem-card.md)).

**Procedure Floor source:** user-facing cron authoring guidance lives at
[`docs/cron-authoring.md`](docs/cron-authoring.md) (#85); deliberately promote
it into the `AGENTS.md` section of the Langfuse `intentive-runtime-bundle`
production prompt. No deploy-owned prompt copy exists.

**Create or edit a job:** the agent writes a markdown **cron card** under `/crons/<name>.md` via built-in filesystem tools. Frontmatter: `name`, `schedule` (`at` / `every` / `cron` + expression), optional per-job `tz`, `status` (`active` | `cancelled`), shell-computed `next_fire_at`. Body: the fire prompt. Minimum interval: **5 minutes** (`config/schedule.ts`).

**Cancel:** `edit_file` with `status: cancelled` (poll loop ignores non-active rows). One-shots (`at`) delete after a successful fire.

**Timezone:** wall-clock schedules resolve against per-job `tz`, else the user's persisted `client_tz` from the latest `connect`, else UTC ([ADR-0025](docs/adr/0025-agent-runtime-device-reported-user-timezone.md)). Clients must report `client_tz` on every connect — see mobile/desktop `AGENTS.md`.

**Fire path:** `createCronScheduler` is **event-driven** (ADR-0035): an in-memory min-heap holds each active job's `next_fire_at`, one `setTimeout` wakes at the earliest due instant, and write-path hooks (`cron-backend.ts` `write`, `cron-turn.ts` post-fire) push committed `next_fire_at` values onto the heap. Neon is the durable source of truth — the heap is rebuilt from `cron_jobs` on boot and reconciled on a coarse 30-min resync; between real events Neon receives zero scheduler queries. On fire, the job enqueues onto the **Per-User Channel** committed lane. `createCronTurnHandler` runs on the user's main thread (`threadId = userId`), records `cron_runs` plus the spine's `runtime_turns` anchor (ADR-0031), applies lifecycle changes, and can speak only by calling `post_message_back`.

**Debug due fires:** inspect `agent_runtime.cron_jobs` (`status`, `next_fire_at`, `attempt_count`) and `cron_runs`; confirm `agent_instances.client_tz`; run `pnpm --filter ./services/agent-runtime test -- test/cron-*.test.mjs`. Vocabulary and tradeoffs: [`CONTEXT.md`](CONTEXT.md) → **Cron**; scheduler shape: [ADR-0024](docs/adr/0024-agent-runtime-cron-scheduler-poll-loop-not-timer-wheel.md).

## Heartbeat operations

`createHeartbeatScheduler` is **event-driven** (ADR-0035): an in-memory
min-heap holds the due instant for active, oriented Coaching Windows, one
`setTimeout` wakes at the earliest, and a coarse resync reloads active rows as a
safety net. The 120-second floor is measured from the window start or last
successful Monitoring Turn. There is no heartbeat table; `coaching_windows` is
the durable source of truth. Due users enter the Per-User Channel's collapsible
best-effort lane, then the `MonitoringCoordinator` revalidates the feature gate,
active row, and live Desktop attestation before reading evidence or invoking the
model.

Monitoring Turns are silent by default. The coordinator fixes the upper
evidence cursor, reads at most 32 current records / 12,000 rendered characters
for one window, and advances only through the last included event after success.
User-visible output happens only if DeepAgents calls the content-only
`post_message_back`; the shell internally binds window/evidence identity,
revalidates before commit and delivery, persists Conversation History, and
routes only to the matching Desktop.

## Guardrails specific to this deployable

- **WebSocket-only public ingress.** Pre-handshake, only `connect` is accepted; everything else is rejected with structured protocol error.
- **JWT verified locally** via Neon Auth JWKS. Do not call the Control Plane to authenticate clients.
- **`tenant_id` does not exist in v1** — scope state by `user_id` alone. The User is the tenant.
- **Inbound event set is fixed** to what `packages/protocol/` defines. Unknown events rejected.
- **Push notifications go through the Control Plane.** Do not call Expo, APNs, or FCM directly. Invoke **Post-Message-Back**, which calls CP's `/internal/notifications/push`.
- **Coaching delivery never pushes.** Opening Orientation and proactive
  interventions require a non-null matching `window_id` and a live active
  Desktop attestation. Never route them to Mobile or Control Plane push.
- **Ledger bodies are metadata-only.** Detailed OCR/audio evidence belongs in
  expiring `perception_records`; new `runtime_events` perception entries retain
  dedupe/ordering metadata only.
- **Multi-Tenant = shared compute, per-user isolation.** No per-user VM, no per-user process.
- **Always-alive.** Never deploy this to a stateless platform (Cloud Run, Lambda, etc.). Long-running state, agent loops, cron, and heartbeat require persistence in process.
