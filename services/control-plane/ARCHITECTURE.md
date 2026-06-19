# Control Plane Architecture

This document is the deployable-local architecture contract for `services/control-plane/`. It extends the monorepo-wide rules in [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md); it does not replace them. For vocabulary, read [`CONTEXT.md`](CONTEXT.md) (Control Plane) and the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md) first. For agent-facing working rules, read [`AGENTS.md`](AGENTS.md).

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
     Neon (CP schema)   Expo Push Service      shared-secret HTTP (inbound public ingress — ADR-0008)
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

`CHANGELOG.md`
: Shipped and in-progress Control Plane changes (Keep a Changelog).

`ARCHITECTURE.md`
: This file. Control-Plane-local architecture contract and map.

[`docs/prd/control-plane-PRD.md`](../../docs/prd/control-plane-PRD.md)
: Control Plane PRD. Issues `#17`, `#23`, `#26`, `#27`, `#30`, `#49`, `#50` on [GitHub](https://github.com/sruj75/Intentive/issues).

`src/main.ts`
: Process entrypoint — composition root that wires JWKS verifier, Neon SQL, identity + devices + gates + agents services, Runtime Session Start client, and the Hono app (`GET /me`, `GET /agent`, `POST /consent`, `POST /sibling-invitation/skip`, `POST /devices/register`). Keep it construction-only.

`src/index.ts`
: Workspace library entry — re-exports config and contract samples for other packages; not the HTTP server boot path.

`src/http/auth.ts`
: Authenticated-HTTP-request boundary — `requireUser`, bearer extraction, and the one canonical `401`/`503` mapping for JWT verification failures on every public endpoint. Service-local (transport-specific); not in `packages/providers`.

`src/http/device-signal.ts`
: Device-signal header boundary — `readDeviceSignal` for the optional `X-Client-Kind` / `X-Capture-Permission-Granted` headers shared by `GET /me` and `GET /agent` (ADR-0005). Malformed headers degrade to no signal.

`src/db/sql.ts`
: The narrow `Sql` tagged-template port every domain `repo` imports — keeps the Neon driver out of unit-tier module graphs.

`migrations/`
: SQL owned by the behavior issue that introduces each table (`0001_users.sql` for identity, #23; `0002_user_gates.sql` for cross-client gates, #26; `0003_devices.sql` for Device Registry, #27; `0004_agent_instances.sql` for Agent Instance Registry, #30; `0005_notification_tickets.sql` for notification ticket tracking, #49). Applied to production by #50; repo tests bootstrap a disposable Neon branch per ADR-0003.

[`docs/adr/0004-account-state-assembled-by-identity-composer.md`](docs/adr/0004-account-state-assembled-by-identity-composer.md)
: ADR — `identity.resolveAccount` is the sole assembler of `AccountState`; `gates` exposes `nextGate`, not `/me` shaping.

[`docs/adr/0005-device-aware-gates-from-live-signals.md`](docs/adr/0005-device-aware-gates-from-live-signals.md)
: ADR — device-local and sibling gates computed from live client signals and observed devices; no stored device-OS permission state.

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

- `identity` (**#23/#30/#47**): JWT verification + `control_plane.users` resolution; `GET /me` HTTP handler (`ui/get-me.ts`, `ui/app.ts`). `resolveAccount` is the `AccountState` **composer** — it assembles `user_id` (identity), `next_gate` (gates, #26/#27), `has_agent_instance` (agents, #30), and `has_desktop_client` (derived from the same `devices.listDevicesForUser` read used for sibling-gate inputs, #47) by calling those domains' services and the token-free `devices.listDevicesForUser` read, rather than each domain owning the `/me` response. `resolveRoutingContext` exposes the principal + gate slice for `GET /agent` without assembling full Account State.
- `devices` (**#27/#49**): Device Registry (`control_plane.devices`), Expo Push Token storage, idempotent `POST /devices/register`, and the token-free `listDevicesForUser` read port for the identity composer.
- `gates` (**#26/#27**): Cross-Client Gate persistence (Consent Primer, Sibling Invitation skip) and the pure `computeNextGate(inputs) → PreChatGateKind | null` sequencer (consent → sibling skip or observed sibling device → Desktop-only capture permission), exposed to the identity composer as `nextGate(userId, device)`; the idempotent writes `POST /consent` and `POST /sibling-invitation/skip`. **Identity** is satisfied by the auth boundary (a 200 from `GET /me` means signed in), so `computeNextGate` never returns `identity`. gates does not depend on `devices` — the composer gathers inputs. gates does not own `GET /me` shaping; the identity composer does (ADR-0004, ADR-0005).
- `agents` (**#30**): Agent Instance Registry (`control_plane.agent_instances`, one row per `user_id`), Runtime Session Start client (`POST /internal/sessions/start`), `ensureAgentInstance` (idempotent get-or-create via live Session Start + local record), and `hasAgentInstance` read port for the identity composer. Registry stores `agent_instance_id` only — `ws_url` is re-derived from Session Start on every `GET /agent`.
- `routing` (**#30**): `GET /agent` handler (`ui/get-agent.ts`); authenticates, enforces gate satisfaction server-side (`403`), calls `agents.ensureAgentInstance`, returns `GetAgentResponse` with pass-through Neon Auth `runtime_jwt` (ADR-0002 — never CP-signed). Surfaces retryable `503` when JWKS or Session Start is unavailable.
- `notifications`: Expo Push Service client, ticket/receipt cleanup, push delivery, `POST /internal/notifications/push` ingress, and protected receipt-check maintenance ingress.

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
- Hold Expo Push Tokens and push delivery here. The Agent Runtime never calls Expo, APNs, or FCM directly.
- Make every write endpoint that represents a one-time lifecycle transition idempotent.
- Treat Session Start as the only Control Plane → Agent Runtime call that creates state: synchronous, idempotent per User, bundling Agent Instance creation with the Conversation Start Trigger.
- Compute the next Pre-Chat Gate from `client_kind` plus cross-client state in one model behind `GET /me` — not per-screen flags or per-gate endpoints.
- Honor the Cross-Client vs Device-Local gate distinction: Identity Gate and Consent Primer are shared; Capture Permission Setup is device-local.
- There is no `tenant_id`, org, workspace, per-user VM, per-user process, or per-user schema in v1. The User is the tenant.
- The GCP Provisioner is removed from v1. Agent Instance Creation is synchronous; there is no per-user provisioning lifecycle.

Mechanical checks should enforce:

- Layer direction inside `src/domains/**`.
- No cross-deployable imports from `apps/**` or other `services/**`.
- Provider-only access for auth, telemetry, feature flags, Neon clients, and push-provider clients.
- HTTP-contract consistency through `packages/api-contract`.
- Forbidden vocabulary from `CONTEXT.md` and the root `CONTEXT-MAP.md` avoid lists (especially "backend", "proxy", "gateway" as names for this service).

## Boundaries

Client boundary:

- Clients reach the Control Plane over public HTTPS for Routing and gate state only: `GET /me`, `GET /agent`, `POST /consent`, `POST /sibling-invitation/skip`, `POST /devices/register`.
- All public endpoints require a verified Neon Auth JWT and resolve a `user_id` principal.
- The Control Plane returns the next gate and Routing; it never returns or accepts conversation content.

Agent Runtime boundary:

- The Control Plane calls the Runtime's `POST /internal/sessions/start` (shared-secret auth; may use a VPC connector to reach the Runtime) during `GET /agent` on first chat entry. This call carries a request timeout so a hung Runtime fails fast into a retryable `503` instead of tying up request slots (ADR-0007).
- The Control Plane receives the Runtime's `POST /internal/notifications/push` and fans the push out via Expo Push Service. This inbound internal endpoint is on **public ingress** behind a per-direction shared secret — it is not network-isolated in v1 (ADR-0008).
- These two internal calls are the entire Control Plane ↔ Runtime surface. There is no message forwarding.

Neon boundary:

- The Control Plane owns identity, device, gate, and Agent Instance Registry tables in its own schema (`control_plane`) reached through its own Postgres role (`control_plane_app`). The role holds privileges **only** on the `control_plane` schema; it has no grants on the Agent Runtime's schema, and vice versa. There are no tables shared across the two services.
- It never reads or writes the Runtime's Conversation History, runtime events, VFS overlays, or scheduler state.
- Migrations live under `services/control-plane/migrations/` and create their tables inside the `control_plane` schema. The schema namespace and the `control_plane_app` role + grants are provisioned in #50 (which holds Neon admin access); each behavior issue adds only its own tables. Repo integration tests create ephemeral branches and bootstrap the schema themselves (ADR-0003).

Deployment boundary:

- Deploys to Cloud Run because it is stateless request/response. Resident state, sockets, queues, and schedulers belong to the Agent Runtime, not here.
- **One production environment, no staging.** Each deploy lands as a no-traffic Cloud Run revision, is smoke-tested at its own revision URL against `GET /readyz` (a real Neon + JWKS dependency check, distinct from the dumb `GET /healthz` liveness probe), and is promoted to live traffic only when green. Auto-deploy-on-push is enabled only after one manual deploy proves out (ADR-0007).
- PR CI: `.github/workflows/control-plane-ci.yml` (typecheck + test, optional Neon repo integration). Deploy CI builds a Docker image, pushes to Artifact Registry, and runs `gcloud run deploy` (see `control-plane-deploy` workflow). Secrets are delivered from Google Secret Manager for password-bearing values; non-secret names/URLs are plain env vars.

## Cross-cutting Concerns

Providers:

- Auth (Neon Auth JWKS), telemetry, feature flags, Neon connection pools, and the Expo Push Service client enter domains through explicit provider interfaces.
- Domain code depends on provider interfaces, not concrete SDK setup.

Observability:

- Log JWT verification outcomes, gate-state transitions, Session Start calls, device registrations, and push fan-out results through `bootstrapObservability` from `packages/providers`; Cloud Run owns request lifecycle logs at the edge.
- Sentry is configured with `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, and `SENTRY_MODE` (`errors-only` by default). Langfuse is intentionally absent because the Control Plane has no LLM trace surface.
- Redact JWTs, Expo Push Tokens, device fingerprints, and any secret material from log fields by default.

Reliability:

- Idempotency keys protect one-time lifecycle writes (consent, sibling skip, device registration, Session Start).
- A push to a User with no registered devices returns `delivered: false`, `device_count: 0` without error.
- Session Start is safe to retry: it creates or loads the same Agent Instance.

Security:

- Public endpoints use Neon Auth JWT verification via shared Providers.
- The internal `POST /internal/notifications/push` endpoint uses shared-secret auth on public ingress, never user JWT (ADR-0008).
- Expo Push Tokens and push-provider configuration live only here, loaded from configuration/secrets, never committed.
- The Control Plane is the only writer of account truth; structural single-writer ownership prevents cross-client state drift.

Testing:

- **Service tier:** logic with repo/provider fakes (`test/identity-service.test.mjs`, `test/gates-service.test.mjs`, `test/gates-compute-next-gate.test.mjs`, `test/agents-service.test.mjs`, `test/runtime-session-start.test.mjs`, `test/readiness.test.mjs`, gate write-handler tests).
- **Repo tier:** real SQL against a disposable Neon branch per ADR-0003 (`test/users-repo.integration.test.mjs`, `test/user-gates-repo.integration.test.mjs`, `test/devices-repo.integration.test.mjs`, `test/agent-instances-repo.integration.test.mjs`; skips without `NEON_API_KEY` / `NEON_PROJECT_ID`).
- **HTTP tier:** Hono routing via `app.request` with handler fakes (`app.test.mjs`, `test/get-me-handler.test.mjs`, `test/get-agent-handler.test.mjs`, `test/post-device-register-handler.test.mjs`); shared auth and device-signal boundaries (`test/http-auth.test.mjs`, `test/http-device-signal.test.mjs`).
- Still to cover: push fan-out and the no-proxy guardrail as those domains land (#49).
