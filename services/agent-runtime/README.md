# Agent Runtime

The always-alive, multi-tenant service at `services/agent-runtime/` that runs Companion behavior for every user. Built on [LangChain DeepAgents (TypeScript)](https://github.com/langchain-ai/deepagentsjs) with an OpenClaw-style outer shell (gateway, sessions, cron, heartbeat, workspace). Deploys to a GCE VM because it hosts long-running state and cannot run on stateless platforms.

For vocabulary, see [`CONTEXT.md`](CONTEXT.md) (and the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md)). For deployable structure, see [`ARCHITECTURE.md`](ARCHITECTURE.md); for monorepo-wide layer rule and topology, see [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md). For per-deployable working rules, see [`AGENTS.md`](AGENTS.md).

## Reference patterns

Upstream pattern packs (OpenClaw, Hermes) live under [`reference/`](reference/). Start at [`reference/AGENTS.md`](reference/AGENTS.md), then read the topic card for your task.

Regenerate the packs and anchors with:

```bash
node scripts/generate-reference-llms.mjs
```

## Development

```bash
# from this directory
pnpm install
pnpm typecheck
pnpm test   # builds protocol + runtime, then node --test
pnpm start  # serves public WebSocket + private Internal API from dist/main.js
```

Repo-tier tests (`test/sessions-repo.integration.test.mjs`) create a disposable Neon
branch when `NEON_API_KEY` and `NEON_PROJECT_ID` are set; without them those tests skip.

Configuration is validated at boot through `loadConfig` in `src/config/env.ts` (required
env keys: `PUBLIC_WS_URL`, `INTERNAL_SECRET_FROM_CONTROL_PLANE`,
`CONTROL_PLANE_INTERNAL_BASE_URL`, `INTERNAL_SECRET_TO_CONTROL_PLANE`,
`NEON_DATABASE_URL`, `NEON_AUTH_JWKS_URL`, `NEON_AUTH_ISSUER`,
`NEON_AUTH_AUDIENCE`, `OPENROUTER_API_KEY`; defaults for `PORT`, `INTERNAL_PORT`,
`NEON_DATABASE_ROLE`, `OPENROUTER_BASE_URL`, and `RUNTIME_MODEL`; optional paired
`LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` with optional `LANGFUSE_BASE_URL`).
Copy [`.env.example`](.env.example) to `.env` for local boot. Domains must not
re-parse `process.env`.

## Internal HTTP Surface

| Endpoint                        | Purpose                                            |
| ------------------------------- | -------------------------------------------------- |
| `GET  /health`                  | Shallow liveness probe                             |
| `POST /internal/sessions/start` | Control Plane starts or confirms an Agent Instance |

Health checks use `/health` to match the Control Plane.

## Deployment

GitHub Actions builds a Docker image, pushes to Artifact Registry, and swaps the running container on the GCE VM (`gcloud compute instances update-container`). See `.github/workflows/agent-runtime-deploy.yml` at the repo root. Strategy and rationale: [`docs/adr/0032`](docs/adr/0032-agent-runtime-gce-deploy-single-vm-tls-load-balancer-in-place-swap.md) (single VM behind a TLS load balancer; in-place image swap with a lightweight drain) and [`docs/adr/0033`](docs/adr/0033-agent-runtime-internal-session-start-public-ingress-shared-secret.md) (internal Session Start on public ingress behind a shared secret).

Unlike the stateless Control Plane on Cloud Run, this is **one always-alive VM**: TLS, the stable front door, secret delivery, health, and zero-downtime are ours to provide, not Google's.

Production is provisioned as VM `agent-runtime` in `us-west1-a`, behind a global HTTPS load balancer for `runtime.heyintentive.com`. DNS must point `runtime.heyintentive.com` at the reserved global IP `8.232.97.220` before the Google-managed certificate can become active and clients can use `wss://runtime.heyintentive.com/ws`.

### Secret inventory (required for a green deploy)

All configuration is read at the one config seam (`src/config/env.ts`). Password-bearing values come from Google Secret Manager (fetched at boot by `scripts/boot-fetch-secrets.mjs` using the VM's dedicated service account); non-secret names/URLs are plain env vars. The deploy workflow writes `SECRET_NAMES` as a space-separated allowlist of Secret Manager names to fetch; every loaded secret becomes an env var with the same name. Entries can also be aliases in `ENV_VAR=secret-name` form, for example `SENTRY_DSN=AGENT_RUNTIME_SENTRY_DSN` or `INTERNAL_SECRET_FROM_CONTROL_PLANE=INTERNAL_SECRET_TO_RUNTIME`. Local development can omit `SECRET_NAMES` and pass plain env vars directly.

| Variable                                                      | Secret?  | Purpose                                                                    |
| ------------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `NEON_DATABASE_URL`                                           | ✅ vault | **Direct** (non-pooled) Neon connection string for `agent_runtime_app`     |
| `NEON_DATABASE_ROLE`                                          | env      | Postgres role name (defaults to `agent_runtime_app`)                       |
| `OPENROUTER_API_KEY`                                          | ✅ vault | OpenRouter key for the Companion model                                     |
| `INTERNAL_SECRET_FROM_CONTROL_PLANE`                          | ✅ vault | Guards inbound `POST /internal/sessions/start` (CP → Runtime)              |
| `INTERNAL_SECRET_TO_CONTROL_PLANE`                            | ✅ vault | Guards outbound push handoff (Runtime → CP `/internal/notifications/push`) |
| `LANGFUSE_SECRET_KEY`                                         | ✅ vault | Langfuse secret key (optional; paired with public key)                     |
| `SENTRY_DSN`                                                  | ✅ vault | Sentry project DSN for error/health capture                                |
| `PUBLIC_WS_URL`                                               | env      | Public `wss://` URL clients connect to (the load-balancer hostname)        |
| `CONTROL_PLANE_INTERNAL_BASE_URL`                             | env      | Base URL for the Runtime → Control Plane push call                         |
| `NEON_AUTH_JWKS_URL` / `_ISSUER` / `_AUDIENCE`                | env      | Neon Auth JWT verification (same project as the Control Plane)             |
| `OPENROUTER_BASE_URL` / `RUNTIME_MODEL`                       | env      | Model endpoint + model id (defaults in `env.ts`)                           |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_BASE_URL` / `LANGFUSE_MODE` | env      | Langfuse behavior/eval layer (optional)                                    |
| `SENTRY_ENVIRONMENT` / `SENTRY_RELEASE` / `SENTRY_MODE`       | env      | Sentry environment, deploy SHA, mode (`errors-only` default)               |
| `PORT` / `INTERNAL_PORT`                                      | env      | Public WS port (8080) and internal API port (8081)                         |

> There is **no** runtime-JWT signing key (the `runtime_jwt` is the client's pass-through Neon Auth token) and **no** push-provider credentials (APNs/FCM/Expo) — push goes through the Control Plane. Do not provision those; the service cannot read them.

### Database provisioning (one-time, this service owns it)

Same Neon project as the Control Plane, **separate schema and role**. Via the Neon MCP / `neon-postgres` skill: create the `agent_runtime` schema → create a least-privilege `agent_runtime_app` role (`USAGE` **and `CREATE`** on `agent_runtime`, DML on its tables, **no access to the `control_plane` schema**, no superuser) → run migrations `0001`–`0009` against production → let the boot-time `PostgresStore.setup()` and checkpointer setup create the LangGraph store + checkpoint tables (that is why the role needs `CREATE`). Build `NEON_DATABASE_URL` from the **direct (non-`-pooler`)** host — the LangGraph persistent-connection/prepared-statement usage conflicts with Neon's PgBouncer pooling, and a single always-alive process has no pool to exhaust.

### Deploy procedure (careful path)

Step-by-step release runbook (tag-free, SHA-identified; in-place swap gated by load-balancer convergence): [`docs/RELEASE.md`](docs/RELEASE.md). Production state and the full smoke scripts: [`../../docs/PRODUCTION.md`](../../docs/PRODUCTION.md).

1. **First deploy is manual and pre-launch.** A single VM has no no-traffic revision — the image swap _is_ the promotion — so run the first `workflow_dispatch` deploy **before real users exist**, when dropping connections costs nothing.
2. **Smoke-check the real `wss://` end to end** (not just `/health`, since the live conversation is the thing that breaks): a client completes the TLS handshake → `connect` returns a snapshot → a `user_message` gets a **companion reply** (proves TLS + Neon + OpenRouter + the turn spine). Confirm a Control-Plane Session Start reaches `/internal`, the Cron/Heartbeat loops logged "started," and Sentry is receiving events.
3. Only if green, set the `DEPLOY_ENABLED` repository variable to `true` so pushes to `main` auto-deploy.
4. **Rollback** = re-run `update-container` pinned to the previous `github.sha` image (prior tags remain in Artifact Registry). Keep the last-good SHA noted.
