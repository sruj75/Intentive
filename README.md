# Intentive

A proactive companion that lives across your phone and your Mac.

See [`AGENTS.md`](AGENTS.md) to get oriented, [`docs/CONTEXT.md`](docs/CONTEXT.md) for vocabulary, and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for structure.

## The four deployables

- **`apps/mobile/`** — iOS Expo app (chat surface)
- **`apps/desktop/`** — macOS Tauri app (capture only)
- **`services/control-plane/`** — identity, devices, routing
- **`services/agent-runtime/`** — the always-alive Companion runtime

## Workspace

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm dev
```
