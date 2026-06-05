# Agent Runtime — Agent Guide

The always-alive, multi-tenant service that runs **Companion** behavior. Built on **DeepAgents** (LangChain TypeScript: `langchain-ai/deepagentsjs`).

**Always read first:**

- [`CONTEXT.md`](CONTEXT.md) — Agent Runtime vocabulary (Agent Runtime, Agent Instance, Post-Message-Back, Cron, Heartbeat, Persistence Adapter, Bundle Path Set, Session Snapshot, VFS write policy, bundle version pinning)
- [`../../CONTEXT-MAP.md`](../../CONTEXT-MAP.md) — context map + shared product language
- [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) — layer rule
- [`../../docs/TESTING.md`](../../docs/TESTING.md) — verification commands, harness scopes, and CI expectations
- [`reference/AGENTS.md`](reference/AGENTS.md) — OpenClaw / Hermes pattern reference (start at topic cards, not raw `*-llms.txt` packs)

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
- `sessions` — per-user session queue, ordering, message idempotency
- `protocol` — inbound/outbound event handling (every event type in `packages/protocol/`)
- `runtime` — DeepAgents loop, Agent Instance lifecycle
- `cron` — scheduled-trigger primitive
- `heartbeat` — interval-trigger primitive
- `memory` — runtime memory, Neon-backed durable store, virtual filesystem overlay
- `bundles` — runtime bundle documents (`AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md` — immutable; `USER.md`, `MEMORY.md` — agent-writable overlays), overlay resolution
- `internal` — server-to-server API surface (Session Start)

## Stack & deploy

- Node / TypeScript + LangChain DeepAgents
- Deploys to **Google Compute Engine** VM (Container-Optimized OS), one always-alive process serving all users
- Reads Neon Postgres via runtime-owned schema (separate role from Control Plane)

## Reference patterns

The [`reference/`](reference/) directory contains OpenClaw and Hermes pattern packs as **input** — not architecture to copy verbatim. Use them when implementing gateway, sessions, cron, channels, heartbeat, memory, hooks, workspace, etc. Always read the topic card under `reference/topics/` first; raw `*-llms.txt` is a fallback.

A related reference implementation worth reading: [`czl9707/build-your-own-openclaw`](https://github.com/czl9707/build-your-own-openclaw) — module-by-module walk through chat-loop, tools, persistence, compaction, event-driven, channels, websocket, cron-heartbeat, multi-layer-prompts, post-message-back, memory.

## Guardrails specific to this deployable

- **WebSocket-only public ingress.** Pre-handshake, only `connect` is accepted; everything else is rejected with structured protocol error.
- **JWT verified locally** via Neon Auth JWKS. Do not call the Control Plane to authenticate clients.
- **`tenant_id` does not exist in v1** — scope state by `user_id` alone. The User is the tenant.
- **Inbound event set is fixed** to what `packages/protocol/` defines. Unknown events rejected.
- **Push notifications go through the Control Plane.** Do not call APNs directly. Invoke **Post-Message-Back**, which calls CP's `/internal/notifications/push`.
- **Multi-Tenant = shared compute, per-user isolation.** No per-user VM, no per-user process.
- **Always-alive.** Never deploy this to a stateless platform (Cloud Run, Lambda, etc.). Long-running state, agent loops, cron, and heartbeat require persistence in process.
