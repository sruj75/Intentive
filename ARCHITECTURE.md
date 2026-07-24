# Architecture

Monorepo-wide architecture contract for Intentive. For vocabulary, see [CONTEXT-MAP.md](CONTEXT-MAP.md) and each deployable's `CONTEXT.md`. For deployable-local structure, see each deployable's `ARCHITECTURE.md`. For decision rationale, see [docs/adr/](docs/adr/).

Two ideas govern everything below:

1. **One source of truth per piece of knowledge.** Anything we know once should live in exactly one module. Information that lives in two modules will drift.
2. **Mechanical enforcement of boundaries.** Architecture that depends on humans remembering rules decays in weeks. Architecture enforced by lint rules and structural tests survives. Inspired by the layered-domain pattern from [OpenAI's Harness Engineering post](https://openai.com/index/harness-engineering/).

## Bird's-eye Overview

Intentive is a proactive companion across phone and Mac. The monorepo holds four deployables, shared wire contracts in `packages/`, and mechanical linters that enforce the layer rule. Each deployable owns its deploy pipeline; the monorepo unifies code, contracts, docs, and CI — not deployment.

| Path                      | What it is                                                                                        | Deploys to                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `apps/mobile/`            | **Mobile Client** — iOS Expo app, the chat surface                                                | EAS Build → TestFlight → App Store                     |
| `apps/desktop/`           | **Desktop Client** — macOS SwiftPM app: capture, Screen Memory, floating-bar chat, voice, effects | GitHub Actions → signed `.dmg` → landing page download |
| `services/control-plane/` | **Control Plane** — stateless server, identity + routing                                          | GitHub Actions → Cloud Run                             |
| `services/agent-runtime/` | **Agent Runtime** — always-alive multi-tenant agent service                                       | GitHub Actions → GCE VM (Container-Optimized OS)       |

```text
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

Clients reach **Control Plane** over public HTTPS for routing and gate state, then **Agent Runtime** over public WSS for the data path. Control Plane sits **beside** the client↔runtime path, never **on** it.

## Codemap

Deployable-local contracts (read the owning file before changing that tree):

| Deployable     | `ARCHITECTURE.md`                                                                  | `AGENTS.md`                                                            |
| -------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Mobile Client  | [`apps/mobile/ARCHITECTURE.md`](apps/mobile/ARCHITECTURE.md)                       | [`apps/mobile/AGENTS.md`](apps/mobile/AGENTS.md)                       |
| Desktop Client | [`apps/desktop/ARCHITECTURE.md`](apps/desktop/ARCHITECTURE.md)                     | [`apps/desktop/AGENTS.md`](apps/desktop/AGENTS.md)                     |
| Control Plane  | [`services/control-plane/ARCHITECTURE.md`](services/control-plane/ARCHITECTURE.md) | [`services/control-plane/AGENTS.md`](services/control-plane/AGENTS.md) |
| Agent Runtime  | [`services/agent-runtime/ARCHITECTURE.md`](services/agent-runtime/ARCHITECTURE.md) | [`services/agent-runtime/AGENTS.md`](services/agent-runtime/AGENTS.md) |

**Layer rule** — inside every business domain, code depends only forward:

```text
                            ┌───────────────────────┐
                            │  Providers (cross-    │
                            │  cutting: auth,       │
                            │  telemetry, flags)    │
                            └───────────┬───────────┘
                                        │
                                        ▼
   types ──► config ──► repo ──► service ──► runtime ──► ui
```

- **types** — shape definitions (Zod, TS types, Swift structs). No behavior.
- **config** — environment-resolved settings.
- **repo** — durable storage access. Only layer that touches the database directly.
- **service** — domain logic and orchestration. **No I/O of its own.**
- **runtime** — process wiring, event loops, queues, schedulers.
- **ui** — user-facing surface: React (Mobile/Desktop), HTTP handlers (Control Plane), WebSocket handlers (Agent Runtime).

**Business domains** — vertical product slices inside one deployable (not deployables, not technical layers). Each follows the layer rule; full domain lists live in deployable `ARCHITECTURE.md` files:

- **Mobile** (`apps/mobile/src/domains/`): `auth`, `onboarding`, `chat`, `notifications`, `account`
- **Desktop** (`apps/desktop/macos/Desktop/Sources/` during the SwiftPM renovation): Desktop Capture Layer, Screen Memory, Desktop Context Compiler, Runtime Bridge, Floating Bar, Voice, Effect Runner, Account
- **Control Plane** (`services/control-plane/src/domains/`): `identity`, `devices`, `gates`, `agents`, `routing`, `notifications`
- **Agent Runtime** (`services/agent-runtime/src/domains/`): `gateway`, `sessions`, `conversation`, `protocol`, `runtime`, `delivery`, `cron`, `heartbeat`, `memory`, `bundles`, `internal`

**Shared packages** (`packages/`) — cross-deployable unification:

- **`protocol/`** — WebSocket message contract (single wire-format source of truth)
- **`api-contract/`** — Control Plane HTTP contract
- **`domain-types/`** — shared in-process shapes (`CLIENT_KINDS`, branded ids)
- **`boundary/`** — parse-at-boundary decode (`parseBoundary` / `BoundaryParseError`; ADR-0004)
- **`providers/`** — shared cross-cutting clients (auth/JWKS, telemetry, observability, feature flags)

Rule: **shared knowledge lives in `packages/`, not duplicated across deployables.**

**Canonical tree** (abbreviated):

```text
intentive/
├── apps/mobile/          # Expo; app/ = navigation, src/domains/ = capability
├── apps/desktop/         # macOS SwiftPM app; docs/ + macos/Desktop/Sources/
├── services/control-plane/   # src/config/, src/domains/, migrations/
├── services/agent-runtime/   # src/config/, src/domains/
├── packages/{protocol,api-contract,domain-types,boundary,providers}/
├── docs/adr/             # system-wide ADRs
├── tools/linters/        # mechanical enforcement
├── ARCHITECTURE.md       # this file
├── CONTEXT-MAP.md
└── AGENTS.md
```

**Change flow example** — add outbound Protocol event `companion_typing`:

1. Edit `packages/protocol/` schema first.
2. Monorepo typecheck flags every stale handler/emitter.
3. Implement Mobile handler (`chat/runtime/`) and Runtime emitter (`protocol/service/`).
4. Layer-direction lint confirms forward-only imports.
5. Path-filtered CI runs only affected deployable workflows.

## Architectural Invariants

Within each domain:

```text
types -> config -> repo -> service -> runtime -> ui
```

Hard invariants:

- **One Agent Runtime** — multi-tenant, shared compute, per-user logical Agent Instance. No per-user VM. No `tenant_id`; the User is the tenant.
- **One Protocol** — `packages/protocol/` is the WebSocket contract for every client and the Runtime.
- **Control Plane beside the data path** — issues Routing (`GET /agent` → URL + JWT) and steps out. Never proxies in-session messages.
- **Single CP→Runtime state-creating call** — `POST /internal/sessions/start` (synchronous, idempotent per User).
- **Conversation History is server-truth** — no on-device chat persistence in Mobile v1.
- **Post-Message-Back is the only notification trigger** — regular replies never push. Push delivery and device push tokens live in Control Plane (Expo Push Service in v1).
- **Pre-Chat Gates are Control-Plane-owned** — Cross-Client (Identity, Consent, Sibling Invitation skip) vs Device-Local (Capture Permission Setup).
- **Desktop joins the one Companion conversation** — floating-bar chat and voice use the same Protocol and Conversation History as Mobile; Screen Memory perception remains separate from chat history.
- **Cross-deployable code through `packages/` only** — no `apps/mobile/**` importing `services/**` or sibling apps.
- **Cross-cutting through Providers only** — auth, telemetry, feature flags, and connector clients enter domains through explicit `providers/` interfaces.

Mechanical checks (`tools/linters/`, run in CI):

1. **Layer-direction lint** — TS via `eslint-plugin-intentive-architecture`; Desktop Swift boundaries are guarded by module seams plus SwiftPM tests.
2. **Cross-deployable import lint**
3. **Provider-only cross-cutting lint**
4. **CONTEXT.md vocabulary lint** — forbidden terms from `_Avoid_` lists
5. **Protocol consistency** — stale `packages/protocol/` imports fail typecheck

Lint error messages include remediation instructions for agents.

## Boundaries

**Client ↔ Control Plane (public HTTPS, JWT):** `GET /me`, `GET /agent`, `POST /consent`, `POST /sibling-invitation/skip`, `POST /devices/register` (schemas in `packages/api-contract/`).

**Client ↔ Agent Runtime (public WSS, Protocol):** direct data path after Routing. Mobile and Desktop can send `user_message`; Desktop sends `perception_event` and `session_end_marker` for Screen Memory perception.

**Control Plane ↔ Agent Runtime (private HTTP, directional shared secrets):**

- CP → Runtime: `POST /internal/sessions/start`
- Runtime → CP: `POST /internal/notifications/push`
- Operator/scheduler → CP: `POST /internal/notifications/check-receipts` (maintenance; separate secret)

**Control Plane ↔ Expo Push Service:** push fan-out, ticket storage, receipt checking, dead-token cleanup. Runtime never calls Expo, APNs, or FCM directly.

**Neon:** one project, separate schemas and Postgres roles per service. Control Plane owns account truth; Runtime owns Conversation History and runtime state. No cross-service direct table reads.

**Deployment:** each deployable owns its pipeline (see Bird's-eye table). GCP Provisioner is removed from v1; Runtime is one always-on GCE VM deployed by CI/CD.

## Cross-cutting Concerns

**Providers:** auth checks, telemetry, feature flags, and external connector clients (Expo Push Service, Neon pools, etc.) enter every domain through `providers/` — nothing else cross-cuts. Deployable-local connector clients (e.g. Control Plane's Expo client) may live in that deployable's `providers/` re-export rather than `packages/providers/`.

**Verification:** `pnpm harness` (preferred gate), `pnpm typecheck`, `pnpm lint`, `pnpm test`. Full map: [`docs/TESTING.md`](docs/TESTING.md).

**Documentation network:** [`AGENTS.md`](AGENTS.md) (agent map), [`CONTEXT-MAP.md`](CONTEXT-MAP.md) (vocabulary), deployable `CONTEXT.md` / `ARCHITECTURE.md` / `docs/adr/`, system-wide [`docs/adr/`](docs/adr/).

**Factory / CI:** `.github/workflows/monorepo-foundation.yml` runs the versioned `repo-contracts`, `node-workspaces`, and `desktop-swift` harness groups in parallel and joins them behind the stable `Gate` status. Environment-specific workflows retain path filters for migration validation, deployment, release, dependency policy, and advisory Factory Radar. Custom lints in `tools/linters/eslint-plugin-intentive-architecture/README.md` document the enforcement story.
