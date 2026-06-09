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
| `POST /devices/register`        | Idempotent device registration (includes APNs token)              |

Schemas live in [`packages/api-contract`](../../packages/api-contract).

## Internal surface (Control Plane → Agent Runtime callbacks)

| Endpoint                            | Purpose                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `POST /internal/notifications/push` | Agent Runtime asks Control Plane to fan out a Push Notification via APNs |

## Development

```bash
# from this directory
pnpm install
pnpm build && pnpm start   # src/main.ts — Hono GET /me + POST /consent + POST /sibling-invitation/skip
pnpm typecheck
pnpm test         # build + node --test; repo integration tests need NEON_* (see ADR-0003)
```

Pull requests that touch this deployable run `.github/workflows/control-plane-ci.yml`.
`GET /me` resolves a verified JWT to `AccountState` via `control_plane.users` (#23) and
cross-client `next_gate` from `control_plane.user_gates` (#26). `has_agent_instance`
remains a placeholder until #30.

## Deployment

GitHub Actions builds a Docker image, pushes to Artifact Registry, and runs `gcloud run deploy`. See `.github/workflows/control-plane-deploy.yml` at the repo root.
