# Mobile Client — Agent Guide

iOS Expo client. The chat surface for the **Companion**. Capture concerns and Mac-specific work live in `apps/desktop/`.

**Always read first:**

- [`CONTEXT.md`](CONTEXT.md) — Mobile Client vocabulary
- [`../../CONTEXT-MAP.md`](../../CONTEXT-MAP.md) — context map + shared product language (Companion, Pre-Chat Gate, Post-Message-Back, etc.)
- [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) — layer rule, why this deployable is structured the way it is

## Role in V1

The Mobile Client is the **only client with a chat surface**. It:

- Renders the **Liquid Glass Chat Shell** (no header, no bottom tabs)
- Runs the Pre-Chat Gate sequence: Identity Gate → Consent Primer → Sibling Client Invitation
- Connects to the **Agent Runtime** directly via WebSocket using **Protocol** schemas from `packages/protocol/`
- Reads **Conversation History** from the WebSocket reconnect snapshot — **no local message store**
- Registers APNs token with the Control Plane; receives **Push Notifications** triggered by **Post-Message-Back**

## Domains

Each lives under `src/domains/<name>/{types,config,repo,service,runtime,ui}/`:

- `auth` — **Auth Adapter**, Identity Gate, Neon/Dev providers ([`adr/0012`](docs/adr/0012-mobile-auth-adapter-with-dev-provider.md))
- `onboarding` — Consent Primer + Sibling Invitation screens; **Launch State Resolver** (`service/`)
- `chat` — `CompanionChat` Intentive Chat Components (`@assistant-ui/react-native`, ADR 0009); dev adapter in `runtime/`; route composes `CompanionChat` only
- `notifications` — APNs token registration, permission ask (on first chat entry, not at launch)
- `account` — Account Surface, logout, app info

## Working docs

- [`../../docs/prd/mobile-PRD.md`](../../docs/prd/mobile-PRD.md) — Mobile PRD
- [`docs/DESIGN.md`](docs/DESIGN.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Mobile-specific design and architecture
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — shipped and in-progress Mobile Client changes
- [`docs/adr/`](docs/adr/) — Mobile Client ADRs (system-wide → [`docs/adr/`](../../docs/adr/))

## Stack & deploy

- Expo / React Native, TypeScript
- Local dev: `pnpm --dir apps/mobile dev` (or `ios` / `android`); tests: `pnpm --dir apps/mobile test` (Node) and `pnpm --dir apps/mobile test:rn` (Jest / RN harness)
- Deploys to TestFlight / App Store via **EAS Build** (Git-based)
- `@assistant-ui/react-native` is the **Chat Primitive Engine** behind Intentive Chat Components — keep it replaceable (ADR 0009 spike: KEEP)

## Guardrails specific to this deployable

- The Mobile Client is **not** the Agent Runtime, Control Plane, or DeepAgents. It is a view.
- Persist **nothing** durably about messages — the server is truth.
- Defer notification permission until the user enters chat for the first time.
- Keep `@assistant-ui/react-native` behind Intentive Chat Components — never let vendor visuals or data shapes leak into product code.
