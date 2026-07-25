# Intentive

A proactive companion that lives across your phone and your Mac.

See [`AGENTS.md`](AGENTS.md) to get oriented, [`CONTEXT-MAP.md`](CONTEXT-MAP.md) for the context map and vocabulary, [`ARCHITECTURE.md`](ARCHITECTURE.md) for monorepo-wide structure, and each deployable's `ARCHITECTURE.md` (alongside `CONTEXT.md`) for local structure.

## The four deployables

- **`apps/mobile/`** — iOS Expo app (chat surface)
- **`apps/desktop/`** — macOS SwiftPM app (capture, Screen Memory, floating-bar chat, voice, effects)
- **`services/control-plane/`** — identity, devices, routing
- **`services/agent-runtime/`** — the always-alive Companion runtime

## Deployable setup pointers

Each deployable owns its local setup notes and guardrails:

- **Mobile:** [`apps/mobile/AGENTS.md`](apps/mobile/AGENTS.md)
- **Desktop:** [`apps/desktop/AGENTS.md`](apps/desktop/AGENTS.md)
- **Control Plane:** [`services/control-plane/AGENTS.md`](services/control-plane/AGENTS.md)
- **Agent Runtime:** [`services/agent-runtime/AGENTS.md`](services/agent-runtime/AGENTS.md)

## Local setup

**Prerequisites**

- **Node ≥ 22** and **pnpm ≥ 11** (`corepack enable` to get pnpm).
- **Desktop only:** macOS with Xcode Command Line Tools. The active desktop app
  is a SwiftPM macOS target under `apps/desktop/macos`.

**Environment variables**

- The services validate their env at startup through a Zod schema and fail fast
  with the missing key names — see `services/control-plane/src/config/env.ts` for
  the required variables.
- The mobile app reads Expo env (`EXPO_PUBLIC_*`). Each deployable's
  `AGENTS.md` (linked above) lists what it needs.

**Running one deployable**

```bash
pnpm --filter ./apps/mobile dev          # Mobile Client (Expo)
cd apps/desktop/macos && ./run.sh        # Desktop Client (SwiftPM macOS)
pnpm --filter ./services/control-plane dev
pnpm --filter ./services/agent-runtime dev
```

## Workspace

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm dev
```

See [`docs/TESTING.md`](docs/TESTING.md) for the full verification map, including Desktop SwiftPM tests, contract tests, coverage, and CI expectations.
