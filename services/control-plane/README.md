# Control Plane

The server-side authority at `services/control-plane/`. Owns identity, device registry, agent instance registry, Pre-Chat Gate state, routing, and notification fan-out. Stateless HTTP request/response. Deploys to Cloud Run.

For vocabulary, see [`CONTEXT.md`](CONTEXT.md) (and the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md)). For deployable structure, see [`ARCHITECTURE.md`](ARCHITECTURE.md); for monorepo-wide layer rule and topology, see [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md). For per-deployable working rules, see [`AGENTS.md`](AGENTS.md). For shipped and in-progress changes, see [`CHANGELOG.md`](CHANGELOG.md).

## Public HTTP surface

| Endpoint                        | Purpose                                                           |
| ------------------------------- | ----------------------------------------------------------------- |
| `GET  /me`                      | Returns Account State + next Pre-Chat Gate for the calling client |
| `POST /consent`                 | Records Consent Primer completion                                 |
| `POST /sibling-invitation/skip` | Records sibling invitation skip                                   |
| `GET  /agent`                   | Issues Agent Runtime URL + JWT (Routing)                          |
| `POST /devices/register`        | Idempotent device registration (includes Expo Push Token)         |

Schemas live in [`packages/api-contract`](../../packages/api-contract).

## Internal surface (Agent Runtime → Control Plane)

| Endpoint                            | Purpose                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `POST /internal/notifications/push` | Agent Runtime asks Control Plane to fan out a Push Notification via Expo Push Service |

## Maintenance surface (operator/scheduler → Control Plane)

| Endpoint                                      | Purpose                                                             |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `POST /internal/notifications/check-receipts` | Bounded Expo receipt checking; clears dead `expo_push_token` values |

## Development

```bash
# from this directory
pnpm install
pnpm build && pnpm start   # src/main.ts — Hono GET /me + GET /agent + gate writes + POST /devices/register
pnpm typecheck
pnpm test         # build + node --test; repo integration tests need NEON_* (see ADR-0003)
```

Pull requests that touch this deployable run `.github/workflows/control-plane-ci.yml`.
`GET /me` resolves a verified JWT to `AccountState` via `control_plane.users` (#23),
device-aware `next_gate` from cross-client state, the caller's device/client signal, and
observed devices (#27, ADR-0005), `has_agent_instance` from the Agent Instance
Registry (#30), and `has_desktop_client` when any registered device has
`client_kind === "desktop"` (#47). `GET /agent` issues Routing (Runtime URL + pass-through Neon Auth JWT)
after gate enforcement and Session Start (#30).

## Deployment

GitHub Actions builds a Docker image, pushes to Artifact Registry, and runs `gcloud run deploy` to **Google Cloud Run**. See `.github/workflows/control-plane-deploy.yml` at the repo root. Strategy and rationale: [`docs/adr/0007`](docs/adr/0007-cloud-run-deploy-and-readiness.md) (no-traffic revision promotion gated by a readiness probe) and [`docs/adr/0008`](docs/adr/0008-internal-endpoints-public-ingress-shared-secret.md) (internal endpoints on public ingress behind a shared secret).

### Secret inventory (required for a green deploy)

The service reads **all** configuration from the one config seam (`src/config/env.ts`). Password-bearing values come from Google Secret Manager; non-secret names/URLs are plain env vars.

| Variable                          | Secret?  | Purpose                                                                  |
| --------------------------------- | -------- | ------------------------------------------------------------------------ |
| `NEON_DATABASE_URL`               | ✅ vault | Pooled Neon connection string for the `control_plane_app` role           |
| `NEON_DATABASE_ROLE`              | env      | Postgres role name (defaults to `control_plane_app`)                     |
| `NEON_AUTH_JWKS_URL`              | env      | Neon Auth JWKS endpoint for user-JWT verification                        |
| `NEON_AUTH_ISSUER`                | env      | Expected JWT issuer                                                      |
| `NEON_AUTH_AUDIENCE`              | env      | Expected JWT audience                                                    |
| `RUNTIME_INTERNAL_BASE_URL`       | env      | Base URL for the CP → Agent Runtime Session Start call                   |
| `INTERNAL_SECRET_TO_RUNTIME`      | ✅ vault | Directional Secret guarding CP → Runtime `/internal/sessions/start`      |
| `INTERNAL_SECRET_FROM_RUNTIME`    | ✅ vault | Directional Secret guarding Runtime → CP `/internal/notifications/push`  |
| `INTERNAL_SECRET_FOR_MAINTENANCE` | ✅ vault | Secret guarding the maintenance `/internal/notifications/check-receipts` |
| `EXPO_ACCESS_TOKEN`               | ✅ vault | Optional Expo Push Service access token                                  |
| `PORT`                            | env      | Injected by Cloud Run (defaults to 8080)                                 |

> There is **no** runtime-JWT signing key and **no** APNs credentials. The `runtime_jwt` is the client's pass-through Neon Auth token ([`docs/adr/0002`](docs/adr/0002-runtime-jwt-passthrough.md)); push delivery goes through Expo Push Service, not APNs ([`docs/adr/0006`](docs/adr/0006-expo-push-service-for-v1-notifications.md)). Do not provision either — the service cannot read them.

### Database provisioning (one-time, this service owns it)

This service's schema is created here, not assumed to exist. Via the Neon MCP / `neon-postgres` skill: create the `control_plane` schema → create a least-privilege `control_plane_app` role (no superuser, grants scoped to `control_plane` only) → run migrations `0001`–`0004` against production → build `NEON_DATABASE_URL` from that role's pooled connection string. Repo tests bootstrap their own ephemeral branches (ADR-0003); production is provisioned once, here.

### Deploy procedure (careful path)

1. Manually trigger `control-plane-deploy` (`workflow_dispatch`) — it builds, pushes, and deploys as a **no-traffic** revision.
2. Smoke-check the new revision at its own URL:
   - `GET /healthz` → `200 {"ok":true,...}` (liveness; process is up).
   - `GET /readyz` → `200` (readiness; Neon `SELECT 1` and Neon Auth JWKS both reachable).
   - `GET /me`, `GET /agent`, `POST /devices/register` without a token → a well-formed `401` (proves the auth boundary is engaged without needing a valid user JWT or writing to prod).
3. Only if green, **promote traffic** to the new revision.
4. Once a manual deploy has proven out, set the `DEPLOY_ENABLED` repository variable to `true` so pushes to `main` auto-deploy.
