# Mobile Client — Agent Guide

iOS Expo client. The chat surface for the **Companion**. Capture concerns and Mac-specific work live in `apps/desktop/`.

**Read first:** [`CONTEXT.md`](CONTEXT.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), then root [`AGENTS.md`](../../AGENTS.md) Start here (testing, ADRs).

## Role in V1

The Mobile Client is the **only client with a chat surface**. It:

- Renders the **Liquid Glass Chat Shell** (no header, no bottom tabs)
- Runs the Pre-Chat Gate sequence: Identity Gate → Consent Primer → Sibling Client Invitation
- Connects to the **Agent Runtime** directly via WebSocket using **Protocol** schemas from `packages/protocol/`
- Reports the device **IANA timezone** as optional `client_tz` on every `connect` frame so the Runtime can resolve wall-clock Cron schedules while the user is offline ([ADR-0025](https://github.com/sruj75/Intentive/blob/main/services/agent-runtime/docs/adr/0025-agent-runtime-device-reported-user-timezone.md) on the Runtime side)
- Renders **Conversation History** from the Runtime Adapter's in-memory **Message Store** (server-truth projection seeded by the reconnect snapshot — never persisted to disk)
- Registers the Expo Push Token with the Control Plane; receives **Push Notifications** triggered by **Post-Message-Back**

## Domains

Each lives under `src/domains/<name>/{types,config,repo,service,runtime,ui}/`:

- `auth` — **Auth Adapter**, Identity Gate, Neon/Dev providers ([`adr/0012`](docs/adr/0012-mobile-auth-adapter-with-dev-provider.md))
- `onboarding` — Consent Primer + Sibling Invitation screens; **Launch State Resolver** + **Launch Route** (`service/resolve-launch-state.ts`, `service/route-for-destination.ts`)
- `chat` — `CompanionChat` Intentive Chat Components (`@assistant-ui/react-native`, ADR 0009/0015); **Runtime Adapter** in `runtime/` + `use-companion-runtime.ts` external-store binding (`retryUserMessage` for failed outbound); **Message Store** in `service/message-store.ts` (the adapter's intent-named interface over `conversation-reducer`); `service/chat-presentation.ts` for Agent State, continuity, and Mac setup banner; `CompanionChat` renders a projected `accountState` (Mac setup banner); Account Affordance opens the Account Surface sheet from `(chat)/`; `dev-transport.ts` for local fixtures. Cross-domain composition (Runtime Adapter, Account State projection, `CompanionChat` + Account Surface) lives in `src/entrypoints/chat-entry.tsx`; the `(chat)/` route renders `<ChatEntry/>` only
- `notifications` — Expo Push Token registration, permission ask (on first chat entry, not at launch)
- `account` — Account Surface sheet (`ui/account-surface.tsx`), Connection Status (`service/account-status.ts`), logout via Auth Adapter + Launch State `markSignedOut()`

## Working docs

- [`../../docs/prd/mobile-PRD.md`](../../docs/prd/mobile-PRD.md) — Mobile PRD
- [`docs/DESIGN.md`](docs/DESIGN.md), [`ARCHITECTURE.md`](ARCHITECTURE.md) — Mobile-specific design and architecture
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — shipped and in-progress Mobile Client changes
- [`docs/adr/`](docs/adr/) — Mobile Client ADRs (system-wide → [`docs/adr/`](../../docs/adr/))

## Stack & deploy

- Expo / React Native, TypeScript
- Local dev: `pnpm --dir apps/mobile dev` (or `ios` / `android`); tests: `pnpm --dir apps/mobile test` (Node) and `pnpm --dir apps/mobile test:rn` (Jest / RN harness); harness: `pnpm harness --scope apps/mobile`
- iOS Simulator verification (start Metro from `apps/mobile`; wipe DerivedData on `clang`/`swift-frontend` crashes): see [`docs/TESTING.md` → Mobile Client → iOS simulator verification](../../docs/TESTING.md#ios-simulator-verification-visual-on-device)
- Deploys to TestFlight / App Store via **EAS Build** (Git-based)
- `@assistant-ui/react-native` is the **Chat Primitive Engine** behind Intentive Chat Components — keep it replaceable (ADR 0009 spike: KEEP)

## Guardrails specific to this deployable

- The Mobile Client is **not** the Agent Runtime, Control Plane, or DeepAgents. It is a view.
- Persist **nothing** durably about messages — the server is truth.
- **`connect.client_tz`:** include the device IANA zone on every reconnect via injectable `resolveTimeZone` in `chat/runtime/runtime-adapter.ts` (defaults to `defaultResolveTimeZone` → `Intl.DateTimeFormat().resolvedOptions().timeZone`). Last report wins across devices; omit only when the platform cannot resolve a zone (Runtime falls back to UTC). Field is optional on the wire but required product behavior once Cron is live.
- Defer notification permission until the user enters chat for the first time.
- Keep `@assistant-ui/react-native` behind Intentive Chat Components — never let vendor visuals or data shapes leak into product code.
- Consume semantic colors via `src/design/theme.ts` (`useMobileTheme()`); do not hard-code product colors in domain UI.
