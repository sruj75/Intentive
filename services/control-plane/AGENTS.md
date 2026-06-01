# Control Plane — Agent Guide

Server-side authority: identity, devices, gate state, agent instance registry, routing, notifications.

**Always read first:**
- [`../../docs/CONTEXT.md`](../../docs/CONTEXT.md) — vocabulary
- [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) — layer rule

## Role in V1

- Authenticates users via **Neon Auth** (Google in v1, Apple later)
- Owns the **Device Registry** (including APNs tokens)
- Tracks **Pre-Chat Gate** completion state (cross-client vs device-local)
- Issues **Routing** to clients via `GET /agent` (URL + JWT)
- Calls Agent Runtime's `POST /internal/sessions/start` on first chat entry (**Session Start**)
- Receives `POST /internal/notifications/push` from Agent Runtime and delivers via APNs

## Domains

Each lives under `src/domains/<name>/{types,config,repo,service,runtime,ui}/`:

- `identity` — Neon Auth integration, User resolution from JWT
- `devices` — Device Registry, APNs token storage, idempotent registration
- `gates` — Pre-Chat Gate state, `/me` response shaping
- `agents` — Agent Instance Registry, Session Start calls to runtime
- `routing` — `/agent` endpoint, JWT minting for runtime
- `notifications` — APNs client, Apple credentials, push delivery

## HTTP surface (public)

| Endpoint | Purpose |
|---|---|
| `GET /me` | Returns Account State + next Pre-Chat Gate |
| `POST /consent` | Records Consent Primer completion (cross-client) |
| `POST /sibling-invitation/skip` | Records skip state (cross-client) |
| `GET /agent` | Returns routing info (Runtime URL + JWT) |
| `POST /devices/register` | Idempotent device + APNs token registration |

Request/response schemas live in `packages/api-contract/`.

## Stack & deploy

- Node / TypeScript
- Deploys to **Google Cloud Run** (stateless HTTP, request/response only in v1)
- Reads Neon Postgres via control-plane-owned schema (separate role from Agent Runtime)

## Guardrails specific to this deployable

- **Never proxy client↔Runtime traffic.** Only issue routing.
- **Sits beside the data path, never on it.**
- Holds APNs credentials. The Agent Runtime never calls APNs directly.
- All write endpoints idempotent where they represent a one-time lifecycle transition.
- **GCP Provisioner is removed from v1.** Agent Instance Creation is synchronous; there is no per-user provisioning lifecycle.
- **Read all configuration from the one seam** at `src/config/` (`loadConfig`) — never re-parse `process.env` in a domain. The Internal API is guarded by **two Directional Secrets** (`INTERNAL_SECRET_TO_RUNTIME`, `INTERNAL_SECRET_FROM_RUNTIME`), one per direction. There is **no** runtime-JWT signing key: `runtime_jwt` is the pass-through Neon Auth token (ADR-0038), verified by the shared `packages/providers` JWKS verifier.
