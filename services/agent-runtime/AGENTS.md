# Agent Runtime — Agent Guide

The always-alive, multi-tenant service that runs **Companion** behavior. Built on **DeepAgents** (LangChain TypeScript: `langchain-ai/deepagentsjs`).

**Read first:** [`CONTEXT.md`](CONTEXT.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CHANGELOG.md`](CHANGELOG.md), [`docs/adr/README.md`](docs/adr/README.md), root [`AGENTS.md`](../../AGENTS.md) Start here, and [`reference/AGENTS.md`](reference/AGENTS.md) when implementing shell domains.

## Role in V1

- Hosts every user's **Agent Instance** (logical, shared compute, scoped by `user_id`)
- Accepts WebSocket connections from clients (Mobile, Desktop, future Android) per **Protocol** schemas in `packages/protocol/`
- Runs DeepAgents loops, executes tools, manages compaction, owns memory
- Drives **Cron** and **Heartbeat** triggers; decides when to **Post-Message-Back**
- Owns **Conversation History** (server-truth) and runtime memory in Neon
- Exposes **Internal API** (`POST /internal/sessions/start`) to the Control Plane

## Domains

Each lives under `src/domains/<name>/{types,config,repo,service,runtime,ui}/`:

- `gateway` — WebSocket server, connect handshake, JWT verification, protocol enforcement
- `sessions` — the Per-User Channel: per-user serialization point for ordering, message idempotency, transactional ingress, queue-serialized Conversation History reads, optional **Interactive Turn** dispatch (`runTurn` after ingress commit; turn failures contained per ADR-0020), **Sensory Buffer** read projection (`repo/sensory-buffer.ts` over `runtime_events`), and optional `onPerceptionArrived` for newly inserted perception events (#38, ADR-0023)
- `conversation` — durable Conversation History transcript (`conversation_messages`), Session Snapshot projection (`readSnapshot`), history backfill reads (ADR-0008)
- `protocol` — inbound/outbound event handling (every event type in `packages/protocol/`)
- `runtime` — DeepAgents adapter (`repo/deep-agents-adapter.ts`), shared **Turn Execution** spine (`service/turn.ts` + `service/working-context.ts`), **Interactive Turn** runner (`service/turn-runner.ts`), durable **Runtime Turn** records (`repo/runtime-turns.ts`, migration `0003_runtime_turns.sql`)
- `delivery` — shared delivery port, process-local connection registry consumer, Control Plane push handoff, Post-Message-Back service/tool, and `deliveries` ledger (ADR-0028)
- `cron` — scheduled-trigger primitive: `/crons/` filesystem cards backed by `cron_jobs`, poll scheduler, Per-User Channel committed enqueue, and `cron_runs`
- `heartbeat` — interval proactivity trigger: computed zero-state poll loop that enqueues best-effort **Monitoring Turns** (ADR-0027)
- `memory` — DeepAgents-native Per-User Memory: `StoreBackend` over Neon plus the `/memories/` VFS route and injected `USER.md` profile
- `bundles` — Procedure Floor resolution and prompt assembly: Langfuse Prompt Management when configured, deploy-bundled fallback otherwise; injects optional `RECENT_PERCEPTION` when present
- `internal` — server-to-server API surface (Session Start)

## Stack & deploy

- Node / TypeScript + LangChain DeepAgents
- Boot config: `src/config/env.ts` (`loadConfig`) — the only place that parses `process.env`; requires `OPENROUTER_API_KEY`, Control Plane outbound push settings, and internal Runtime ingress settings; optional Langfuse keys; see [`.env.example`](.env.example) and `test/config-env.test.mjs`
- Domain folders are **lazy** (ADR-0002): add `src/domains/<name>/…` only when implementing that slice, not empty layer trees upfront
- Deploys to **Google Compute Engine** VM (Container-Optimized OS), one always-alive process serving all users
- Reads Neon Postgres via runtime-owned schema (separate role from Control Plane); SQL migrations live in `migrations/`
- Tests: `pnpm --filter ./services/agent-runtime test`; repo-tier Neon integration tests skip unless `NEON_API_KEY` and `NEON_PROJECT_ID` are set; `#36` adds `test/turn-runner.test.mjs`, `test/runtime-adapter.integration.test.mjs`, and turn coverage in `test/per-user-channel.test.mjs` / `test/runtime-ingress-projection.integration.test.mjs`; the Turn Execution refactor adds `test/turn.test.mjs` and `test/working-context.test.mjs`; `#37` adds `test/bundled-fallback.test.mjs`, `test/assemble-system-prompt.test.mjs`, `test/procedure-floor-resolver.test.mjs`, `test/langfuse-floor-source.test.mjs`, `test/memory-backend.test.mjs`, plus extended connect/turn/runtime coverage; `#38` adds `test/sensory-buffer.integration.test.mjs` and extends `test/assemble-system-prompt.test.mjs`, `test/turn-runner.test.mjs`, `test/runtime-adapter.integration.test.mjs`, and `test/per-user-channel.test.mjs`; `#39` adds `test/cron-backend.test.mjs`, `test/cron-card.test.mjs`, `test/cron-schedule.test.mjs`, `test/cron-scheduler.test.mjs`, `test/cron-turn.test.mjs`, plus extended connect/session-start coverage; the ADR-0027/0028/0029 slice adds delivery, registry, Post-Message-Back, heartbeat, and monitoring-turn tests; harness: `pnpm harness --scope services/agent-runtime`
- Plans: [`docs/plans/agent-runtime-v1-implementation-plan.md`](docs/plans/agent-runtime-v1-implementation-plan.md)

## Reference patterns

The [`reference/`](reference/) directory contains OpenClaw and Hermes pattern packs as **input** — not architecture to copy verbatim. Use them when implementing gateway, sessions, cron, channels, heartbeat, memory, hooks, workspace, etc. Always read the topic card under `reference/topics/` first; raw `*-llms.txt` is a fallback.

LangChain Deep Agents production guide (load before changing memory, backends, or guardrails): [`reference/topics/going-to-production.md`](reference/topics/going-to-production.md) → [`reference/deepagents/going-to-production.md`](reference/deepagents/going-to-production.md). Upstream: [Going to production](https://docs.langchain.com/oss/python/deepagents/going-to-production#user-recommended).

## Cron operations

Agent-authored scheduling only — no shell cron CRUD tools ([ADR-0026](docs/adr/0026-agent-runtime-cron-is-deepagents-native-filesystem-card.md)).

**Procedure Floor mirror:** user-facing cron authoring guidance lives at [`docs/cron-authoring.md`](docs/cron-authoring.md) (#85); promote it into Langfuse `companion-agents` — the deploy bundled fallback does not load it automatically.

**Create or edit a job:** the agent writes a markdown **cron card** under `/crons/<name>.md` via built-in filesystem tools. Frontmatter: `name`, `schedule` (`at` / `every` / `cron` + expression), optional per-job `tz`, `status` (`active` | `cancelled`), shell-computed `next_fire_at`. Body: the fire prompt. Minimum interval: **5 minutes** (`config/schedule.ts`).

**Cancel:** `edit_file` with `status: cancelled` (poll loop ignores non-active rows). One-shots (`at`) delete after a successful fire.

**Timezone:** wall-clock schedules resolve against per-job `tz`, else the user's persisted `client_tz` from the latest `connect`, else UTC ([ADR-0025](docs/adr/0025-agent-runtime-device-reported-user-timezone.md)). Clients must report `client_tz` on every connect — see mobile/desktop `AGENTS.md`.

**Fire path:** `createCronScheduler` polls Neon every **60s** (`selectDue` on `cron_jobs.next_fire_at`), then enqueues the fire onto the **Per-User Channel** committed lane. `createCronTurnHandler` runs on the user's main thread (`threadId = userId`), records `cron_runs`, applies lifecycle changes, and can speak only by calling `post_message_back`.

**Debug due fires:** inspect `agent_runtime.cron_jobs` (`status`, `next_fire_at`, `attempt_count`) and `cron_runs`; confirm `agent_instances.client_tz`; run `pnpm --filter ./services/agent-runtime test -- test/cron-*.test.mjs`. Vocabulary and tradeoffs: [`CONTEXT.md`](CONTEXT.md) → **Cron**; scheduler shape: [ADR-0024](docs/adr/0024-agent-runtime-cron-scheduler-poll-loop-not-timer-wheel.md).

## Heartbeat operations

`createHeartbeatScheduler` polls every **60s** by default and computes due users from `agent_instances` plus latest `runtime_turns`, with no heartbeat table or `next_fire_at` state. Due users enqueue a best-effort **Monitoring Turn** on the Per-User Channel; duplicate/busy best-effort wakes collapse to one pending turn.

Monitoring Turns are silent by default. They record `runtime_turns`; user-visible proactive output happens only if DeepAgents calls `post_message_back`, which persists a `conversation_messages(via_post_message_back = true)` row before delivery.

## Guardrails specific to this deployable

- **WebSocket-only public ingress.** Pre-handshake, only `connect` is accepted; everything else is rejected with structured protocol error.
- **JWT verified locally** via Neon Auth JWKS. Do not call the Control Plane to authenticate clients.
- **`tenant_id` does not exist in v1** — scope state by `user_id` alone. The User is the tenant.
- **Inbound event set is fixed** to what `packages/protocol/` defines. Unknown events rejected.
- **Push notifications go through the Control Plane.** Do not call APNs directly. Invoke **Post-Message-Back**, which calls CP's `/internal/notifications/push`.
- **Multi-Tenant = shared compute, per-user isolation.** No per-user VM, no per-user process.
- **Always-alive.** Never deploy this to a stateless platform (Cloud Run, Lambda, etc.). Long-running state, agent loops, cron, and heartbeat require persistence in process.
