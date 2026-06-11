# Control Plane — Agent Guide

Server-side authority: identity, devices, gate state, agent instance registry, routing, notifications.

**Read first:** [`CONTEXT.md`](CONTEXT.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CHANGELOG.md`](CHANGELOG.md), then root [`AGENTS.md`](../../AGENTS.md) Start here (testing, ADRs). Shared HTTP auth and device-signal boundaries live in `src/http/` (outside `domains/`, like `src/main.ts`).

## Role in V1

- Authenticates users via **Neon Auth** (Google in v1, Apple later)
- Owns the **Device Registry** (including APNs tokens)
- Tracks **Pre-Chat Gate** completion state (cross-client vs device-local)
- Issues **Routing** to clients via `GET /agent` (URL + JWT)
- Calls Agent Runtime's `POST /internal/sessions/start` on first chat entry (**Session Start**)
- Receives `POST /internal/notifications/push` from Agent Runtime and delivers via APNs

## Domains

Each lives under `src/domains/<name>/{types,config,repo,service,runtime,ui}/`:

- `identity` — Neon Auth integration, User resolution from JWT; `resolveAccount` composes `AccountState` (ADR-0004)
- `devices` — Device Registry, APNs token storage, idempotent registration
- `gates` — Pre-Chat Gate state + device-aware `computeNextGate` (the `identity` composer calls `gates.nextGate(userId, device)` with inputs from cross-client repo, live device signal, and `devices.listDevicesForUser`; gates does not own `/me` shaping). See ADR-0005.
- `agents` — Agent Instance Registry, Session Start calls to runtime
- `routing` — `/agent` endpoint; returns Routing with the **pass-through** Neon Auth `runtime_jwt` (never a CP-signed token — ADR-0002), enforces gate state server-side (`403` if a gate is unsatisfied), and surfaces a retryable `503` when Session Start can't reach the Agent Runtime
- `notifications` — APNs client, Apple credentials, push delivery

## HTTP surface (public)

| Endpoint                        | Purpose                                          |
| ------------------------------- | ------------------------------------------------ |
| `GET /me`                       | Returns Account State + next Pre-Chat Gate       |
| `POST /consent`                 | Records Consent Primer completion (cross-client) |
| `POST /sibling-invitation/skip` | Records skip state (cross-client)                |
| `GET /agent`                    | Returns routing info (Runtime URL + JWT)         |
| `POST /devices/register`        | Idempotent device + APNs token registration      |

Request/response schemas live in `packages/api-contract/`.

## Stack & deploy

- Node / TypeScript
- Process entry: `src/main.ts` (composition root); `src/index.ts` re-exports contract samples for workspace consumers
- Tests: `pnpm --filter ./services/control-plane test`; run: `pnpm --filter ./services/control-plane start` (after build)
- Boot config: `src/config/env.ts` (`loadConfig`); see `test/config.test.mjs`
- Harness: `pnpm harness --scope services/control-plane`
- Deploys to **Google Cloud Run** (stateless HTTP, request/response only in v1)
- Reads Neon Postgres via control-plane-owned schema (separate role from Agent Runtime)
- PR CI: `.github/workflows/control-plane-ci.yml` (typecheck + full test suite). Repo integration tests use ephemeral Neon branches when `NEON_API_KEY` / `NEON_PROJECT_ID` are set (ADR-0003).

## Guardrails specific to this deployable

- **Never proxy client↔Runtime traffic.** Only issue routing.
- **Sits beside the data path, never on it.**
- Holds APNs credentials. The Agent Runtime never calls APNs directly.
- All write endpoints idempotent where they represent a one-time lifecycle transition.
- **GCP Provisioner is removed from v1.** Agent Instance Creation is synchronous; there is no per-user provisioning lifecycle.
- **Read all configuration from the one seam** at `src/config/` (`loadConfig`) — never re-parse `process.env` in a domain. The Internal API is guarded by **two Directional Secrets** (`INTERNAL_SECRET_TO_RUNTIME`, `INTERNAL_SECRET_FROM_RUNTIME`), one per direction. There is **no** runtime-JWT signing key: `runtime_jwt` is the pass-through Neon Auth token (ADR-0002), verified by the shared `packages/providers` JWKS verifier.
