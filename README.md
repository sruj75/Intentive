# Intentive

A proactive companion that lives across your phone and your Mac.

See [`AGENTS.md`](AGENTS.md) to get oriented, [`docs/CONTEXT.md`](docs/CONTEXT.md) for vocabulary, and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for structure.

## The four deployables

- **`apps/mobile/`** — iOS Expo app (chat surface)
- **`apps/desktop/`** — macOS Tauri app (capture only)
- **`services/control-plane/`** — identity, devices, routing
- **`services/agent-runtime/`** — the always-alive Companion runtime

## Deployable setup pointers

Each deployable owns its local setup notes and guardrails:

- **Mobile:** [`apps/mobile/AGENTS.md`](apps/mobile/AGENTS.md)
- **Desktop:** [`apps/desktop/AGENTS.md`](apps/desktop/AGENTS.md)
- **Control Plane:** [`services/control-plane/AGENTS.md`](services/control-plane/AGENTS.md)
- **Agent Runtime:** [`services/agent-runtime/AGENTS.md`](services/agent-runtime/AGENTS.md)

## Workspace

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm dev
```

See [`docs/TESTING.md`](docs/TESTING.md) for the full verification map, including desktop Rust tests, contract tests, coverage, and CI expectations.
