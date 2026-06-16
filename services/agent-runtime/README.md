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

## Deployment

GitHub Actions builds a Docker image, pushes to Artifact Registry, and re-deploys the GCE VM. See `.github/workflows/agent-runtime-deploy.yml` at the repo root.
