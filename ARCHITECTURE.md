# Architecture

This document describes the **structural shape** of the Intentive monorepo. For domain vocabulary, see the root [CONTEXT-MAP.md](CONTEXT-MAP.md) and each deployable's own `CONTEXT.md`. For deployable-local structure, see each deployable's `ARCHITECTURE.md` (alongside `CONTEXT.md`). For specific decisions and their rationale, see [docs/adr/](docs/adr/).

Two ideas govern everything below:

1. **One source of truth per piece of knowledge.** Anything we know once should live in exactly one module. Information that lives in two modules will drift.
2. **Mechanical enforcement of boundaries.** Architecture that depends on humans remembering rules decays in weeks. Architecture enforced by lint rules and structural tests survives. Inspired by the layered-domain pattern from [OpenAI's Harness Engineering post](https://openai.com/index/harness-engineering/).

---

## The four deployables

| Path                      | What it is                                                  | Deploys to                                             |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| `apps/mobile/`            | **Mobile Client** — iOS Expo app, the chat surface          | EAS Build → TestFlight → App Store                     |
| `apps/desktop/`           | **Desktop Client** — macOS Tauri app, capture-only          | GitHub Actions → signed `.dmg` → landing page download |
| `services/control-plane/` | **Control Plane** — stateless server, identity + routing    | GitHub Actions → Cloud Run                             |
| `services/agent-runtime/` | **Agent Runtime** — always-alive multi-tenant agent service | GitHub Actions → GCE VM (Container-Optimized OS)       |

Each deployable owns its own deploy pipeline. The monorepo unifies code, contracts, docs, and CI orchestration — not deployment.

---

## The layer rule (inside every business domain)

Each business domain inside every deployable is organized into a fixed set of layers. Code can only depend **forward** through these layers:

```
                            ┌───────────────────────┐
                            │  Providers (cross-    │
                            │  cutting: auth,       │
                            │  telemetry, flags)    │
                            └───────────┬───────────┘
                                        │
                                        ▼
   types ──► config ──► repo ──► service ──► runtime ──► ui
```

**What each layer is for:**

- **types** — shape definitions. Zod schemas, TypeScript types, Rust structs. No behavior.
- **config** — environment-resolved settings. Reads env vars, validates, exposes typed config objects.
- **repo** — durable storage access. SQL queries, KV reads/writes, file system. The only layer that touches the database directly.
- **service** — domain logic. Pure functions and orchestration. Composes repo + types into use-case behavior. **No I/O of its own.**
- **runtime** — process-level orchestration. Wires services into request handlers, event loops, queues, schedulers.
- **ui** — user-facing surface. React components (Mobile/Desktop), HTTP route handlers (Control Plane), WebSocket message handlers (Agent Runtime).

**Cross-cutting via Providers:** auth checks, telemetry, feature flags, and external connector clients (APNs, Neon connection pools, etc.) enter every domain through a single explicit `providers/` interface. Nothing else cross-cuts.

**Why this matters:** when a Claude or Codex agent makes a change, it needs to know _exactly_ which file owns which responsibility. The layer rule makes that legible without reading the whole codebase. The agent looks at a file's path and immediately knows what it can and cannot import.

---

## What counts as a "business domain"

A business domain is a vertical slice of product capability inside one deployable. It is **not** a deployable, and it is not a technical layer. Each domain is a cohesive concept the [CONTEXT-MAP.md](CONTEXT-MAP.md) vocabulary (and the owning deployable's `CONTEXT.md` and `ARCHITECTURE.md`) already names.

**Mobile Client domains** (`apps/mobile/src/domains/`):

- `auth` — Auth Adapter, Identity Gate, Neon/Dev providers (see mobile ADR 0012)
- `onboarding` — Pre-Chat Gate sequence rendering (Consent Primer, Sibling Invitation) + the Launch State Resolver (gate-ordering state machine)
- `chat` — `CompanionChat` Intentive Chat Components (`@assistant-ui/react-native`, mobile ADR 0009/0015); Protocol **Runtime Adapter** with in-memory **Message Store** (`message-store.ts` intent-named seam over `conversation-reducer`, mobile ADR 0015/0016); `chat-presentation.ts` for capability-honest Agent State and continuity chrome (#47); `dev-transport` for local fixtures. Cross-domain chat composition (`ChatEntry` wiring Runtime Adapter + Account State projection + Account Surface) lives in `src/entrypoints/`, not in `app/` or `chat/ui`
- `notifications` — APNs token registration, permission flow
- `account` — Account Surface, logout, app info

**Desktop Client domains** (`apps/desktop/src/domains/` for TS + `apps/desktop/src-tauri/src/domains/` for Rust):

- `auth` — sign-in, Neon Auth UI
- `onboarding` — Capture Permission Setup wizard
- `capture` — ScreenPipe subprocess management, Capture Session lifecycle
- `routing` — Control Plane `GET /agent`, Routing/Session state, Protocol WebSocket session (Rust-owned; JWT never in webview)
- `summarization` — LLM Provider tier resolution, bundled-model download
- `snapshots` — Snapshot Store (local SQLite), Context Heartbeat, live Protocol emission via `WsSessionAgentSink` at the composition root
- `menubar` — tray icon, capture toggle, Capture Error state
- `account` — Settings, sibling invitation

**Control Plane domains** (`services/control-plane/src/domains/`):

- `identity` — Neon Auth integration, User resolution
- `devices` — Device Registry, APNs token storage
- `gates` — Pre-Chat Gate state (Consent Primer, Sibling Invitation skip)
- `agents` — Agent Instance Registry, Session Start internal calls
- `routing` — `GET /agent`, Routing issuance (runtime JWT is the pass-through Neon Auth token; see control-plane ADR-0002)
- `notifications` — APNs client, push delivery

**Agent Runtime domains** (`services/agent-runtime/src/domains/`):

- `gateway` — WebSocket server, connect handshake, JWT verification, protocol enforcement
- `sessions` — per-user session queue, ordering, idempotency
- `conversation` — durable Conversation History transcript, Session Snapshot projection, history backfill reads
- `protocol` — inbound/outbound event handling (`user_message`, `context_snapshot`, `session_end_marker`, `history_backfill_request`, `companion_message`, `presence_update`, `delivery_ack`)
- `runtime` — DeepAgents loop integration, Turn Execution spine, Agent Instance lifecycle
- `delivery` — shared delivery port, connection registry consumer, Control Plane push handoff, Post-Message-Back, `deliveries` ledger
- `cron` — `/crons/` filesystem cards, poll scheduler, committed Per-User Channel enqueue, main-thread cron turns
- `heartbeat` — computed zero-state poll loop, best-effort Monitoring Turn enqueue
- `memory` — DeepAgents Per-User Memory: `StoreBackend` namespace wiring, injected `USER.md`, `/memories/` VFS route
- `bundles` — Procedure Floor resolution (Langfuse Prompt Management + deploy-bundled fallback), per-connection pinning, trigger-aware prompt assembly
- `internal` — server-to-server API surface (Session Start, etc.)

Each domain follows the layer rule internally. A new contributor (or agent) should be able to look at one domain folder and understand its full surface area without reading any other.

---

## Shared packages

These live in `packages/` and are consumed by multiple deployables. **This is where cross-deployable unification happens.**

- **`packages/protocol/`** — WebSocket message contract. Zod schemas for every event, including the `context_snapshot` event shape. Imported by Mobile Client, Desktop Client, and Agent Runtime. **Single source of truth for the wire format.** When this changes, the whole monorepo's typecheck enforces consistency.
- **`packages/api-contract/`** — Control Plane HTTP contract (`GET /me` → `AccountState`, `POST /consent`, `POST /sibling-invitation/skip`, `GET /agent`, `POST /devices/register`). Zod schemas for request/response bodies. Imported by clients and the Control Plane.
- **`packages/domain-types/`** — shared in-process domain shapes that aren't sent over the network as-is: branded ids (`UserId`, `DeviceId`, `AgentInstanceId`, `MessageId`), the canonical `CLIENT_KINDS` tuple, `Device`, `AgentInstance`, `ConversationMessage`. (Wire shapes like the `context_snapshot` event and `AccountState` live in `protocol`/`api-contract`, not here.)
- **`packages/boundary/`** — the one leak-free parse-at-boundary decode (`parseBoundary` / `BoundaryParseError`) for every inbound boundary (WebSocket + HTTP). See monorepo ADR-0004.
- **`packages/providers/`** — shared cross-cutting clients: Neon Auth JWKS verifier, redacted structured telemetry, observability bootstrap (Sentry + Langfuse composition), feature-flag client. Used by both services.

Rule: **if a piece of knowledge is shared between two deployables, it lives in `packages/`, not duplicated.** Lint rules enforce that domain code never imports from another deployable's source.

---

## Mechanical enforcement (the linters)

These live in `tools/linters/`. They run in CI on every PR.

1. **Layer-direction lint** — fails if a `service/` file imports from `runtime/` or `ui/`. Fails if a `repo/` file imports from `service/`. Etc. Custom ESLint rule (`tools/linters/eslint-plugin-intentive-architecture/`) for TS; a custom Node checker (`tools/linters/rust-architecture/`) for Rust, since ESLint never parses `.rs`. Both share the same `LAYER_ORDER`. The Rust checker also enforces a structural rule — only `lib.rs`, `main.rs`, `domains/`, and `providers/` may live directly under `src-tauri/src/` — and treats `lib.rs`/`main.rs` as the exempt composition root. Run via `pnpm lint:architecture:rust` (hard gate).
2. **Cross-deployable import lint** — fails if `apps/mobile/**` imports from `apps/desktop/**` or `services/**`. Cross-deployable code must go through `packages/`.
3. **Provider-only cross-cutting lint** — fails if a domain imports auth/telemetry/flag code from anywhere except `packages/providers/` or its own `providers/` re-export.
4. **CONTEXT.md term lint** — scans source files for forbidden terms listed in CONTEXT.md's `_Avoid_` lines. Surfaces the canonical term in the error message.
5. **Protocol consistency lint** — fails the typecheck of any deployable that uses a stale version of `packages/protocol/`.

All lint error messages include the remediation instruction the agent should follow. Per the Harness Engineering post: "Because the lints are custom, we write the error messages to inject remediation instructions into agent context."

---

## Deployment topology

```
                     ┌──────────────────────────┐
                     │      Neon Postgres       │
                     │  (one project, separate  │
                     │  schemas + roles per     │
                     │  service)                │
                     └──┬────────────────────┬──┘
                        │                    │
              ┌─────────▼─────────┐  ┌───────▼──────────┐
              │  Control Plane    │  │  Agent Runtime   │
              │  (Cloud Run,      │  │  (GCE VM,        │
              │  stateless HTTP)  │  │  always alive)   │
              └────┬────┬─────────┘  └────────┬─────────┘
                   │    │  internal HTTP      │
                   │    └─────────────────────┤
                   │                          │
              GET /me, /agent,         WebSocket (Protocol)
              /consent, /devices            │
                   │                          │
         ┌─────────┴────────────┬────────────┴─────────────┐
         │                      │                          │
   ┌─────▼──────┐         ┌─────▼──────┐            ┌──────▼──────┐
   │   Mobile   │         │   Desktop  │            │  Android    │
   │  (iPhone)  │         │   (Mac)    │            │  (future)   │
   └────────────┘         └────────────┘            └─────────────┘
```

**Network rules:**

- Clients reach **Control Plane** over public HTTPS for routing and gate state.
- Clients reach **Agent Runtime** over public WSS for the data path.
- **Control Plane → Agent Runtime** uses a private interface (VPC) with shared-secret auth.
- **Control Plane → APNs** for push delivery. Agent Runtime never calls APNs directly.
- **Both services** share one Neon project but use separate databases/schemas with separate Postgres roles.

---

## Directory layout (canonical)

```
intentive/
├── apps/
│   ├── mobile/                          ← was Expo
│   │   ├── AGENTS.md                    ← ~100 lines, table of contents only
│   │   ├── CONTEXT.md                   ← Mobile Client vocabulary
│   │   ├── ARCHITECTURE.md              ← Mobile Client structure
│   │   ├── docs/adr/                    ← Mobile Client decisions
│   │   ├── app/                         ← NAVIGATION axis: Expo Router, thin route shells
│   │   │   ├── _layout.tsx              ← root: resolver + Launch Route → redirect effect
│   │   │   ├── (gates)/                 ← shared gate chrome; identity, consent, invite
│   │   │   └── (chat)/                  ← chat route shell; Account Surface opens as sheet from here
│   │   └── src/domains/                 ← CAPABILITY axis: deep modules, layer rule (see mobile ADR 0010)
│   │       ├── auth/
│   │       │   ├── types/
│   │       │   ├── config/
│   │       │   ├── repo/
│   │       │   ├── service/
│   │       │   ├── runtime/
│   │       │   └── ui/
│   │       ├── onboarding/{types,config,repo,service,runtime,ui}/
│   │       ├── chat/{...}/
│   │       ├── notifications/{...}/
│   │       └── account/{...}/
│   └── desktop/                         ← was Tauri
│       ├── AGENTS.md
│       ├── CONTEXT.md                   ← Desktop Client vocabulary
│       ├── ARCHITECTURE.md              ← Desktop Client structure
│       ├── docs/adr/                    ← Desktop Client decisions
│       ├── src/domains/                 ← TS/React side (App.tsx/main.tsx are the exempt composition root)
│       │   ├── auth/{service,ui}/
│       │   ├── account/{ui}/
│       │   └── onboarding/{ui}/
│       └── src-tauri/src/domains/       ← Rust side, same layer rule
│           ├── capture/{types,config,service,runtime}/
│           ├── routing/{types,config,service,runtime}/
│           ├── menubar/{service,ui}/
│           ├── summarization/{types,config,service,runtime}/
│           └── snapshots/{types,repo,runtime}/
│       └── src-tauri/src/providers/     ← Rust cross-cutting (e.g. port)
├── services/
│   ├── control-plane/
│   │   ├── AGENTS.md
│   │   ├── CONTEXT.md                   ← Control Plane vocabulary
│   │   ├── ARCHITECTURE.md              ← Control Plane structure
│   │   ├── docs/adr/                    ← Control Plane decisions
│   │   ├── migrations/                  ← SQL migrations (control_plane schema; applied by #50)
│   │   └── src/
│   │       ├── config/                  ← single validated config seam (loadConfig); not a domain layer
│   │       └── domains/
│   │           ├── identity/{...}/
│   │           ├── devices/{...}/
│   │           ├── gates/{...}/
│   │           ├── agents/{...}/
│   │           ├── routing/{...}/
│   │           └── notifications/{...}/
│   └── agent-runtime/                   ← was Deep Agent
│       ├── AGENTS.md
│       ├── CONTEXT.md                   ← Agent Runtime vocabulary
│       ├── ARCHITECTURE.md              ← Agent Runtime structure
│       ├── docs/adr/                    ← Agent Runtime decisions
│       ├── src/config/                  ← single validated boot config seam (loadConfig); not a domain layer
│       └── src/domains/                 ← domains created lazily per slice (ADR-0002); not all folders exist yet
│           ├── gateway/{...}/
│           ├── sessions/{...}/
│           ├── protocol/{...}/
│           ├── runtime/{...}/
│           ├── delivery/{...}/
│           ├── cron/{...}/
│           ├── heartbeat/{...}/
│           ├── memory/{...}/
│           ├── bundles/{...}/
│           └── internal/{...}/
├── packages/
│   ├── CONTEXT.md                       ← Shared vocabulary (Protocol, Internal API, ...)
│   ├── protocol/                        ← shared WebSocket schemas
│   ├── api-contract/                    ← shared Control Plane HTTP schemas
│   ├── domain-types/                    ← shared domain shapes
│   ├── boundary/                        ← shared parse-at-boundary decode
│   └── providers/                       ← shared cross-cutting clients
├── docs/
│   ├── adr/                             ← system-wide architectural decision records
│   └── plans/                           ← versioned execution plans
├── tools/
│   └── linters/                         ← custom mechanical enforcement
├── .github/workflows/                   ← per-deployable CI
├── ARCHITECTURE.md                      ← this file (monorepo structure)
├── CONTEXT-MAP.md                       ← context map + shared product language
├── AGENTS.md                            ← root map, ~100 lines, pointers only
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## How a change flows through this

**Scenario: add a new outbound event** `companion_typing` to indicate the agent is composing.

1. Edit `packages/protocol/` — add the Zod schema for the new event.
2. Typecheck across the whole monorepo runs. The Mobile Client's `chat/runtime/` handler is now flagged as not handling the new event. The Agent Runtime's `protocol/service/` emitter is flagged.
3. Add the handler in Mobile (`chat/runtime/` calls into `chat/service/` to update the agent state shown in UI).
4. Add the emitter in Agent Runtime (`runtime/service/` triggers `protocol/service/` to send the event when DeepAgents starts a turn).
5. Layer-direction lint passes (handler depends forward; emitter depends forward).
6. Per-deployable CI runs only the affected workflows because path filters detect the protocol change touched mobile + agent-runtime but not Control Plane.

One change, three modules touched, one source of truth for the schema. No drift possible.
