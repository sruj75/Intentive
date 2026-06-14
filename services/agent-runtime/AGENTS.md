# Agent Runtime — Agent Guide

The always-alive, multi-tenant service that runs **Companion** behavior. Built on **DeepAgents** (LangChain TypeScript: `langchain-ai/deepagentsjs`).

**Read first:** [`CONTEXT.md`](CONTEXT.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CHANGELOG.md`](CHANGELOG.md), root [`AGENTS.md`](../../AGENTS.md) Start here, and [`reference/AGENTS.md`](reference/AGENTS.md) when implementing shell domains.

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
- `sessions` — the Per-User Channel: per-user serialization point for ordering, message idempotency, transactional ingress, queue-serialized Conversation History reads, and optional **Interactive Turn** dispatch (`runTurn` after ingress commit; turn failures contained per ADR-0020)
- `conversation` — durable Conversation History transcript (`conversation_messages`), Session Snapshot projection (`readSnapshot`), history backfill reads (ADR-0008)
- `protocol` — inbound/outbound event handling (every event type in `packages/protocol/`)
- `runtime` — DeepAgents adapter (`repo/deep-agents-adapter.ts`), **Interactive Turn** runner (`service/turn-runner.ts`), durable **Runtime Turn** records (`repo/runtime-turns.ts`, migration `0003_runtime_turns.sql`)
- `cron` — scheduled-trigger primitive
- `heartbeat` — interval-trigger primitive
- `memory` — runtime memory, Neon-backed durable store, virtual filesystem overlay
- `bundles` — runtime bundle documents (`AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md` — immutable; `USER.md`, `MEMORY.md` — agent-writable overlays), overlay resolution
- `internal` — server-to-server API surface (Session Start)

## Stack & deploy

- Node / TypeScript + LangChain DeepAgents
- Boot config: `src/config/env.ts` (`loadConfig`) — the only place that parses `process.env`; requires `OPENROUTER_API_KEY`; optional Langfuse keys; see [`.env.example`](.env.example) and `test/config-env.test.mjs`
- Domain folders are **lazy** (ADR-0002): add `src/domains/<name>/…` only when implementing that slice, not empty layer trees upfront
- Deploys to **Google Compute Engine** VM (Container-Optimized OS), one always-alive process serving all users
- Reads Neon Postgres via runtime-owned schema (separate role from Control Plane); SQL migrations live in `migrations/`
- Tests: `pnpm --filter ./services/agent-runtime test`; repo-tier Neon integration tests skip unless `NEON_API_KEY` and `NEON_PROJECT_ID` are set; `#36` adds `test/turn-runner.test.mjs`, `test/runtime-adapter.integration.test.mjs`, and turn coverage in `test/per-user-channel.test.mjs` / `test/runtime-ingress-projection.integration.test.mjs`; harness: `pnpm harness --scope services/agent-runtime`
- Plans: [`docs/plans/agent-runtime-v1-implementation-plan.md`](docs/plans/agent-runtime-v1-implementation-plan.md)

## Reference patterns

The [`reference/`](reference/) directory contains OpenClaw and Hermes pattern packs as **input** — not architecture to copy verbatim. Use them when implementing gateway, sessions, cron, channels, heartbeat, memory, hooks, workspace, etc. Always read the topic card under `reference/topics/` first; raw `*-llms.txt` is a fallback.

LangChain Deep Agents upstream guide: [Going to production](https://docs.langchain.com/oss/python/deepagents/going-to-production) — memory scoping, execution environments, guardrails, and deployment options.

## Guardrails specific to this deployable

- **WebSocket-only public ingress.** Pre-handshake, only `connect` is accepted; everything else is rejected with structured protocol error.
- **JWT verified locally** via Neon Auth JWKS. Do not call the Control Plane to authenticate clients.
- **`tenant_id` does not exist in v1** — scope state by `user_id` alone. The User is the tenant.
- **Inbound event set is fixed** to what `packages/protocol/` defines. Unknown events rejected.
- **Push notifications go through the Control Plane.** Do not call APNs directly. Invoke **Post-Message-Back**, which calls CP's `/internal/notifications/push`.
- **Multi-Tenant = shared compute, per-user isolation.** No per-user VM, no per-user process.
- **Always-alive.** Never deploy this to a stateless platform (Cloud Run, Lambda, etc.). Long-running state, agent loops, cron, and heartbeat require persistence in process.
