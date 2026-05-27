# Agent Runtime

The always-alive, multi-tenant service at `services/agent-runtime/` that runs Companion behavior for every user. Built on [LangChain DeepAgents (TypeScript)](https://github.com/langchain-ai/deepagentsjs) with an OpenClaw-style outer shell (gateway, sessions, channels, cron, heartbeat, workspace). Deploys to a GCE VM because it hosts long-running state and cannot run on stateless platforms.

For vocabulary, see [`../../docs/CONTEXT.md`](../../docs/CONTEXT.md). For boundaries and layer rule, see [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md). For per-deployable working rules, see [`AGENTS.md`](AGENTS.md).

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
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
```

## Deployment

GitHub Actions builds a Docker image, pushes to Artifact Registry, and re-deploys the GCE VM. See `.github/workflows/agent-runtime-deploy.yml` at the repo root.
