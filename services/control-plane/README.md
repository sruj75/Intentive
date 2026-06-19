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

GitHub Actions builds a Docker image, pushes to Artifact Registry, and runs `gcloud run deploy`. See `.github/workflows/control-plane-deploy.yml` at the repo root.
