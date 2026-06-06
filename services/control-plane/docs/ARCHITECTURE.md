# Control Plane Architecture

This document is the deployable-local architecture contract for `services/control-plane/`. It extends the monorepo-wide rules in `../../docs/ARCHITECTURE.md`; it does not replace them. For vocabulary, read [`../CONTEXT.md`](../CONTEXT.md) (Control Plane) and the root [`CONTEXT-MAP.md`](../../../CONTEXT-MAP.md) first. For agent-facing working rules, read `../AGENTS.md`.

## Bird's-eye Overview

The **Control Plane** is the stateless, server-side authority for Intentive account lifecycle: identity, the Device Registry, Pre-Chat Gate state, the Agent Instance Registry, **Routing**, and notification fan-out. It deploys as a Node/TypeScript HTTP service on Google Cloud Run and holds no resident state — every fact lives in its own Neon schema.

It sits **beside** the client↔runtime data path, never **on** it. It tells each signed-in Client _where_ the Agent Runtime is and _who_ the Client is (URL + JWT), then steps out. It never sees an in-session message.

```text
   Mobile Client                         Desktop Client
   GET /me, /agent,                      GET /me, /agent,
   /consent, /devices/register           /consent, /devices/register
        \                                   /
         \------------- public HTTPS ------/
                          |
                      Control Plane (Cloud Run, stateless)
        identity | devices | gates | agents | routing | notifications
                          |
            ┌─────────────┼───────────────────────────┐
            |             |                            |
     Neon (CP schema)   APNs                  private HTTP (VPC, shared secret)
     account truth    push delivery                    |
                                          POST /internal/sessions/start  ──► Agent Runtime
                                          POST /internal/notifications/push ◄── Agent Runtime
```

The Control Plane is the single writer of account truth. Clients render this state but never decide it locally (ADR-0001). The Agent Runtime owns behavior and Conversation History, not account truth.

## Codemap

`AGENTS.md`
: Agent-facing deployable guide. Read it before changing this service.

`README.md`
: Operator/developer entrypoint for the deployable.

`docs/ARCHITECTURE.md`
: This file. Control-Plane-local architecture contract and map.

[`docs/prd/control-plane-PRD.md`](../../../docs/prd/control-plane-PRD.md)
: Control Plane PRD. Issues `#17`, `#23`, `#26`, `#27`, `#30`, `#49`, `#50` on [GitHub](https://github.com/sruj75/Intentive/issues).

`src/main.ts`
: Process entrypoint — composition root that wires JWKS verifier, Neon SQL, identity service, and Hono `GET /me`. Keep it construction-only.

`src/index.ts`
: Workspace library entry — re-exports config and contract samples for other packages; not the HTTP server boot path.

`migrations/`
: SQL owned by the behavior issue that introduces each table (`0001_users.sql` for identity, #23). Applied to production by #50; repo tests bootstrap a disposable Neon branch per ADR-0003.

Domain layout:

```text
src/domains/
  identity/{types,config,repo,service,runtime,ui}/
  devices/{types,config,repo,service,runtime,ui}/
  gates/{types,config,repo,service,runtime,ui}/
  agents/{types,config,repo,service,runtime,ui}/
  routing/{types,config,repo,service,runtime,ui}/
  notifications/{types,config,repo,service,runtime,ui}/
```

Domain responsibilities:

- `identity` (**#23, partial**): JWT verification + `control_plane.users` resolution; `GET /me` HTTP handler (`ui/get-me.ts`, `ui/app.ts`). `next_gate` / `has_agent_instance` are honest placeholders until #26 / #30.
- `devices`: Device Registry, APNs/FCM token storage, idempotent `POST /devices/register`.
- `gates`: Pre-Chat Gate state, Cross-Client vs Device-Local logic, `GET /me` shaping, `POST /consent`, `POST /sibling-invitation/skip`.
- `agents`: Agent Instance Registry, Session Start calls to the Agent Runtime, `has_agent_instance` truth.
- `routing`: `GET /agent`, runtime JWT minting, Routing issuance.
- `notifications`: APNs client, Apple credentials, push delivery, `POST /internal/notifications/push` ingress.

Shared package dependencies:

- `packages/api-contract`: only source of truth for public and internal HTTP request/response schemas. The Control Plane implements these shapes; it never redefines them.
- `packages/providers`: only approved path for auth (Neon Auth JWKS verification), telemetry, feature flags, and connector clients.
- `packages/domain-types`: shared domain shapes (`Device`, `AgentInstance`, branded ids) not tied to one wire format.

## Architectural Invariants

Within each domain, code depends only forward through:

```text
types -> config -> repo -> service -> runtime -> ui
```

Layer meanings:

- `types`: schemas and TypeScript types only.
- `config`: environment parsing and typed settings.
- `repo`: durable storage access (the control-plane-owned Neon schema).
- `service`: domain logic and orchestration; no direct I/O.
- `runtime`: process wiring, request handlers, internal HTTP clients.
- `ui`: protocol-facing adapter layer. In this service, HTTP route handlers live here.

Hard invariants:

- Never proxy, forward, or inspect a client↔Runtime message. Issue Routing and step out of the data path.
- Sit beside the data path, never on it. Runtime throughput is not bounded by Control Plane capacity.
- Be the single writer of account truth: one identity, one onboarding record, one Agent Instance per User regardless of how many Clients they install.
- Verify user JWTs through the shared `packages/providers` auth boundary — the same verifier the Agent Runtime uses. Do not write a Control-Plane-local verifier.
- Own the control-plane Neon schema with a Postgres role separate from the Agent Runtime's. No Client and no Runtime reads Control Plane tables directly.
- Hold APNs credentials and device tokens here. The Agent Runtime never calls APNs directly.
- Make every write endpoint that represents a one-time lifecycle transition idempotent.
- Treat Session Start as the only Control Plane → Agent Runtime call that creates state: synchronous, idempotent per User, bundling Agent Instance creation with the Conversation Start Trigger.
- Compute the next Pre-Chat Gate from `client_kind` plus cross-client state in one model behind `GET /me` — not per-screen flags or per-gate endpoints.
- Honor the Cross-Client vs Device-Local gate distinction: Identity Gate and Consent Primer are shared; Capture Permission Setup is device-local.
- There is no `tenant_id`, org, workspace, per-user VM, per-user process, or per-user schema in v1. The User is the tenant.
- The GCP Provisioner is removed from v1. Agent Instance Creation is synchronous; there is no per-user provisioning lifecycle.

Mechanical checks should enforce:

- Layer direction inside `src/domains/**`.
- No cross-deployable imports from `apps/**` or other `services/**`.
- Provider-only access for auth, telemetry, feature flags, Neon clients, and APNs clients.
- HTTP-contract consistency through `packages/api-contract`.
- Forbidden vocabulary from `../CONTEXT.md` and the root `CONTEXT-MAP.md` avoid lists (especially "backend", "proxy", "gateway" as names for this service).

## Boundaries

Client boundary:

- Clients reach the Control Plane over public HTTPS for Routing and gate state only: `GET /me`, `GET /agent`, `POST /consent`, `POST /sibling-invitation/skip`, `POST /devices/register`.
- All public endpoints require a verified Neon Auth JWT and resolve a `user_id` principal.
- The Control Plane returns the next gate and Routing; it never returns or accepts conversation content.

Agent Runtime boundary:

- The Control Plane calls the Runtime's private `POST /internal/sessions/start` (shared-secret auth, VPC) during `GET /agent` on first chat entry.
- The Control Plane receives the Runtime's `POST /internal/notifications/push` and fans the push out via APNs.
- These two internal calls are the entire Control Plane ↔ Runtime surface. There is no message forwarding.

Neon boundary:

- The Control Plane owns identity, device, gate, and Agent Instance Registry tables in its own schema (`control_plane`) reached through its own Postgres role (`control_plane_app`). The role holds privileges **only** on the `control_plane` schema; it has no grants on the Agent Runtime's schema, and vice versa. There are no tables shared across the two services.
- It never reads or writes the Runtime's Conversation History, runtime events, VFS overlays, or scheduler state.
- Migrations live under `services/control-plane/migrations/` and create their tables inside the `control_plane` schema. The schema namespace and the `control_plane_app` role + grants are provisioned in #50 (which holds Neon admin access); each behavior issue adds only its own tables. Repo integration tests create ephemeral branches and bootstrap the schema themselves (ADR-0003).

Deployment boundary:

- Deploys to Cloud Run because it is stateless request/response. Resident state, sockets, queues, and schedulers belong to the Agent Runtime, not here.
- PR CI: `.github/workflows/control-plane-ci.yml` (typecheck + test, optional Neon repo integration). Deploy CI builds a Docker image, pushes to Artifact Registry, and runs `gcloud run deploy` (see `control-plane-deploy` workflow).

## Cross-cutting Concerns

Providers:

- Auth (Neon Auth JWKS), telemetry, feature flags, Neon connection pools, and the APNs client enter domains through explicit provider interfaces.
- Domain code depends on provider interfaces, not concrete SDK setup.

Observability:

- Log request lifecycle, JWT verification outcomes, gate-state transitions, Session Start calls, device registrations, and push fan-out results.
- Redact JWTs, APNs tokens, device fingerprints, and any secret material from log fields by default.

Reliability:

- Idempotency keys protect one-time lifecycle writes (consent, sibling skip, device registration, Session Start).
- A push to a User with no registered devices returns `delivered: false`, `device_count: 0` without error.
- Session Start is safe to retry: it creates or loads the same Agent Instance.

Security:

- Public endpoints use Neon Auth JWT verification via shared Providers.
- The internal `POST /internal/notifications/push` endpoint uses shared-secret auth on a private network path, never user JWT.
- APNs credentials live only here, loaded from configuration/secrets, never committed.
- The Control Plane is the only writer of account truth; structural single-writer ownership prevents cross-client state drift.

Testing:

- **Service tier:** logic with repo/provider fakes (identity service/handler tests landed in #23).
- **Repo tier:** real SQL against a disposable Neon branch per ADR-0003 (`test/users-repo.integration.test.mjs`; skips without `NEON_API_KEY` / `NEON_PROJECT_ID`).
- **HTTP tier:** Hono routing via `app.request` with handler fakes (`app.test.mjs`).
- Still to cover: gate sequencing, idempotent writes, Session Start, push fan-out, and the no-proxy guardrail as those domains land (#26–#30, #49).
