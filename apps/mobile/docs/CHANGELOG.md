# Changelog

All notable changes to the Intentive Mobile Client (`apps/mobile/`). Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project will adopt
[Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

Everything below is on the foundation lane (`#18`–`#22`) and has not shipped to
TestFlight or the App Store. Entries are grouped by issue where that mapping is clear.

### Added

- **Monorepo import** — Mobile Client brought into the Intentive workspace as
  `@intentive/mobile` (Expo SDK 56, React Native, TypeScript, `expo-router`). Domain
  layout under `src/domains/{auth,onboarding,chat,…}/` with layer-direction lint;
  mobile-specific `CONTEXT.md`, `ARCHITECTURE.md`, `docs/DESIGN.md`, and ADRs
  `0001`–`0011` (product direction: chat-first surface, remote Agent Runtime,
  navigation vs capability axes, in-memory Launch State, Liquid Glass shell intent).

- **Expo app scaffold + Launch State foundation** ([Issue #18]) —
  - Expo Router root layout with reactive redirects driven by **Launch Destination**
    (splash while `RESOLVING`).
  - Route zones: `(gates)/` (`identity`, `consent`, `invite`) and `(chat)/` — thin
    route files compose domain `ui` only ([ADR 0010](adr/0010-mobile-navigation-and-capability-as-orthogonal-axes.md)).
  - `src/providers/launch-state/` — `LaunchState` types, in-memory store
    (`LaunchStateProvider`), and **stub `LaunchStateSource`** with named dev scenarios
    (`signed-out`, `needs-consent`, `needs-invite`, `ready`) per
    [ADR 0011](adr/0011-mobile-launch-state-as-in-memory-projection-of-cp-gate-truth.md).
  - `src/domains/onboarding/service/resolve-launch-state.ts` — pure **Launch State
    Resolver** (`LaunchState → LaunchDestination`); gate screens never choose the
    next step.
  - Initial gate/chat **dev stubs** (replaced by `#19`–`#22`).
  - Node tests: resolver matrix, stub source wiring; Jest RN harness +
    `test/launch-flow.rn.test.tsx` gate-walk loop.
  - `pnpm --dir apps/mobile test` (Node) and `test:rn` (Jest, `*.rn.test.tsx` only).

- **Launch hydration hardening** — `metro.config.js` monorepo resolution;
  `LaunchStateProvider` cold-start hydration behavior tightened; RN launch-flow tests
  extended for hydration edge cases (with shared auth-error typing cleanup in
  `packages/providers`).

- **Identity Gate + Auth Adapter** ([Issue #19]) —
  - `src/domains/auth/service/auth-adapter.ts` — single `signIn` / `signOut` /
    `restoreSession` / `getAccessToken` boundary ([ADR 0012](adr/0012-mobile-auth-adapter-with-dev-provider.md)).
  - **Neon Auth provider** — Better Auth Expo client (`neon-client.ts`,
    `neon-provider.ts`); Google/Apple capability mapping; `NEON_ENABLED_PROVIDERS`
    empty until `#23` supplies an `https` OAuth redirect (Neon trusted origins reject
    `intentive://`).
  - **Dev Auth Provider** — `__DEV__`-only launch sign-in with no real JWT.
  - `src/domains/auth/ui/identity-gate.tsx` — real Identity Gate; success writes
    `signedIn` via launch-state seam; recoverable/cancelled/not-configured outcomes.
  - `src/domains/auth/ui/auth-context.tsx` — session surface for the gate.
  - `.env.example` — `EXPO_PUBLIC_NEON_AUTH_BASE_URL` for Neon Auth base URL.
  - Tests: `auth-adapter`, `auth-dev-provider`, `auth-neon-provider` (Node);
    `identity-gate.rn.test.tsx` + gate-walk updates (RN).

- **Consent Primer** ([Issue #20]) — `src/domains/onboarding/ui/consent-primer.tsx`
  replaces the dev stub; trust-setting copy; accept writes `consent: completed` into
  Launch State optimistically ([ADR 0013](adr/0013-mobile-consent-primer-writes-launch-state-directly.md)).
  `consent-primer.rn.test.tsx`.

- **Sibling Client Invitation** ([Issue #21]) —
  `src/domains/onboarding/ui/sibling-invitation.tsx` replaces the dev stub; skippable
  macOS-setup invite; **"Not now"** writes `siblingInvitation: skipped` (never
  self-attests `completed`) ([ADR 0014](adr/0014-mobile-sibling-invitation-skippable-invite-screen.md)).
  `sibling-invitation.rn.test.tsx`.

- **Account state launch flow** ([Issue #23]) —
  - `src/providers/launch-state/control-plane-source.ts` — real `LaunchStateSource`
    hydrates from Control Plane `GET /me` via injected `getUserJwt` + `fetch`; missing
    session returns signed-out without a network call.
  - `src/domains/onboarding/service/account-state-to-launch-state.ts` — pure
    `AccountState → LaunchState` mapper (`next_gate` → gate positions).
  - `app/_layout.tsx` — composition root wires `createControlPlaneLaunchStateSource`
    (replaces the stub for production boot).
  - `.env.example` — `EXPO_PUBLIC_CONTROL_PLANE_BASE_URL` for the CP base URL.
  - Tests: `account-state-to-launch-state.test.mjs`,
    `control-plane-launch-state-source.test.mjs`; `launch-flow.rn.test.tsx` covers the
    signed-out path with production wiring.

- **Chat Primitive Engine spike (KEEP)** ([Issue #22]) — _uncommitted on branch
  `issue-19to22` at time of writing; included here so the log matches the working
  tree._
  - `@assistant-ui/react-native@0.1.20` behind Intentive Chat Components
    (`src/domains/chat/ui/companion-chat.tsx`) — custom user/assistant rows, Intentive
    composer slot, loading/error/streaming/retry; route renders `<CompanionChat />`
    only ([ADR 0009](adr/0009-mobile-assistant-ui-native-as-chat-primitive-engine.md)
    spike outcome).
  - `src/domains/chat/runtime/dev-chat-adapter.ts` — canned `ChatModelAdapter` for
    dev (reply / error / abort-safe streaming); error-status contract documented for
    `#33` Protocol adapter.
  - Tests: `companion-chat.rn.test.tsx`, `dev-chat-adapter.test.mjs`.
  - Test-harness only: scoped Babel CJS `overrides` for `@assistant-ui/*` /
    `assistant-stream` / `nanoid` under `NODE_ENV=test`; jest
    `transformIgnorePatterns` whitelist; `test/stubs/assistant-cloud.js` +
    `moduleNameMapper`; devDependency `@babel/plugin-transform-modules-commonjs`.

### Changed

- **Launch Route** — `route-for-destination.ts` owns `LaunchDestination →` splash or
  redirect href; `app/_layout.tsx` runs the redirect effect only. Node contract:
  `route-for-destination.test.mjs`. Dev/test harnesses use `createStubLaunchStateSource`
  so stub scenarios cannot drift from `source.ts`.
- **Auth Adapter capability honesty** — disabled social providers and absent dev
  provider short-circuit to `not-configured` in the adapter (no dead OAuth flow).
  **Auth Providers** (`neon-provider`, `dev-provider`) are sign-in-only strategies;
  session, token, and sign-out stay on the adapter + Neon client.
- **Walk-safe dev stubs** — `signed-out` stub scenario pre-seeds gates `pending`
  (not `null`) so optimistic sign-in cannot strand on `RESOLVING` splash.
- Pre-Chat Gate and Companion Chat routes now import real domain screens instead of
  stubs (`identity`, `consent`, `invite`, `chat`).
- `apps/mobile/AGENTS.md`, `ARCHITECTURE.md`, and root `docs/TESTING.md` synced
  with foundation-lane test surfaces and `#22` coverage.
- ADR 0009 extended with spike outcome table, adapter error contract, and test-harness
  findings for `#33` / `#45`.

### Removed

- Dev stubs superseded by real screens: `identity-gate-stub.tsx`,
  `consent-primer-stub.tsx`, `sibling-invitation-stub.tsx`, `chat-shell-stub.tsx`.
- Placeholder `scaffold.ts` types under `auth` and `chat` domains.

### Fixed

- **`babel-preset-expo` unresolvable under pnpm** — the Expo Babel preset was only a
  transitive dependency of `expo`, so pnpm's strict linking left it unresolvable from
  `@intentive/mobile`. Both `pnpm --filter @intentive/mobile test:rn` and the Metro /
  iOS-simulator bundle failed with `Cannot find module 'babel-preset-expo'`. Declared
  it as an explicit mobile `devDependency` (`~56.0.14`).
- **`expo-network` missing for `@better-auth/expo`** ([Issue #19]) — the Better Auth
  Expo client `import()`s `expo-network` unconditionally even though it is declared an
  _optional_ peer, so it was never installed and the iOS Metro bundle failed to resolve
  it. Surfaced on the first successful simulator bundle. Installed via
  `expo install expo-network` (`~56.0.4`); native pod linked.
- **Chat Primitive Engine spike verified on iOS simulator** ([Issue #22]) —
  `<CompanionChat/>` exercised end-to-end on iPhone 17 Pro (iOS 26.2): gate walk →
  empty chat → send → user row → dev-adapter streamed assistant reply → composer reset.
- **`test:rn` hung after passing** ([Issue #22]) — all suites passed but Jest never
  exited (`Jest did not exit one second after the test run has completed`), hanging the
  process indefinitely — a CI footgun. Root cause (via `--detectOpenHandles`):
  `@assistant-ui/tap`'s scheduler opens a module-scoped `MessageChannel` singleton at
  import time — a ref'd `MessagePort` handle kept alive by its `onmessage` listener with
  no teardown API, so it can't be cleaned up from tests. Fixed by running
  `jest --forceExit`; rationale documented in `package.json` (`//test:rn`).

### Deferred (not in this changelog as shipped behavior)

- **#23 (remainder)** — cold-launch session restore against a real Neon session,
  https OAuth redirect / enabled providers (`NEON_ENABLED_PROVIDERS` still empty; dev
  provider remains the working path until #61).
- **#33** — Protocol WebSocket Runtime Adapter; replace dev chat adapter; Conversation
  History reconnect snapshot.
- **#45** — Liquid Glass chat shell visuals, floating composer, safe-area / keyboard.
- **#46** — Account Surface and sign-out UX.
- **CI** — `test:rn` remains opt-in locally; root `pnpm test` runs Node mobile tests
  only (see `docs/TESTING.md`).
- Production chat persistence remains out of scope per ADR/server-truth model; the
  local runtime adapter is dev-only until `#33`.

[Issue #18]: https://github.com/sruj75/Intentive/issues/18
[Issue #19]: https://github.com/sruj75/Intentive/issues/19
[Issue #20]: https://github.com/sruj75/Intentive/issues/20
[Issue #21]: https://github.com/sruj75/Intentive/issues/21
[Issue #22]: https://github.com/sruj75/Intentive/issues/22
[Issue #23]: https://github.com/sruj75/Intentive/issues/23
[Issue #33]: https://github.com/sruj75/Intentive/issues/33
[Issue #45]: https://github.com/sruj75/Intentive/issues/45
[Issue #46]: https://github.com/sruj75/Intentive/issues/46
