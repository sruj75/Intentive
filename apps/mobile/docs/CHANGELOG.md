# Changelog

All notable changes to the Intentive Mobile Client (`apps/mobile/`). Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project will adopt
[Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

Everything below is on the foundation lane (`#18`–`#22`) and has not shipped to
TestFlight or the App Store. Entries are grouped by issue where that mapping is clear.

### Added

- **Pre-chat onboarding funnel** — omi-modeled funnel minimum after the Consent Primer
  ([ADR 0018](adr/0018-mobile-pre-chat-funnel-minimum.md), [ADR 0019](adr/0019-mobile-onboarding-funnel-collapses-to-one-gate.md)):
  - **Get Started** — pre-auth landing inside `/(gates)/identity` (not a gate; local
    step to sign-in options via `auth/ui/get-started.tsx`).
  - **Onboarding funnel** — collapsed `onboarding` gate with local step sequencing in
    `onboarding/ui/onboarding-funnel.tsx` (name → acquisition source → grant permissions);
    route zone `/(onboarding)/` wires the injected notification-permission ask.
  - **Free Trial** — cosmetic offer gate at `/(gates)/trial` (`onboarding/ui/free-trial.tsx`).
  - **Launch State** — `MISSING_ONBOARDING` and `MISSING_TRIAL` destinations;
    `route-for-destination.ts` maps them to `/(onboarding)` and `/(gates)/trial`.
    Stub scenarios `needs-onboarding` and `needs-trial`; mapper marks both `completed`
    for real `GET /me` until Control Plane reports them.
  - Tests: `get-started.rn.test.tsx`, `onboarding-funnel.rn.test.tsx`,
    `name.rn.test.tsx`, `acquisition-source.rn.test.tsx`, `grant-permissions.rn.test.tsx`,
    `free-trial.rn.test.tsx`; extended `launch-flow.rn.test.tsx`,
    `resolve-launch-state.test.mjs`, `account-state-to-launch-state.test.mjs`.

- **Errors-only Sentry telemetry** — `src/providers/telemetry/` is the Mobile Client's
  Sentry seam (`Telemetry` port, `initTelemetry`, `createSentryTelemetry`,
  `wrapRoot`). `app/_layout.tsx` initializes from `EXPO_PUBLIC_SENTRY_DSN` (blank
  disables reporting in local dev); the `@sentry/react-native/expo` plugin in
  `app.json` wires native build integration. Domains receive injected telemetry
  only — **Auth Adapter** and **Runtime Adapter** capture explicit failures;
  `@sentry/react-native` never imports from domain or route code. Errors-only:
  no tracing, replay, profiling, or **Conversation History** payloads. Tests:
  `auth-adapter.test.mjs`, `runtime-adapter.test.mjs`.

- **Expo Push Token registration** ([Issue #49]) — `notifications` domain now asks
  permission on first **Companion Chat** entry, obtains an Expo Push Token through
  a narrow platform port, reads a stable SecureStore-backed device fingerprint,
  and best-effort registers the Mobile Client with `POST /devices/register`.
  The pure register client uses injected `fetch`/`getUserJwt`, validates the
  response with `@intentive/api-contract`, and returns early when no User JWT is
  available. Tests: `register-device.test.mjs`, `push-registration.test.mjs`,
  and `chat-entry.rn.test.tsx` for the mount hook.
- **Continuity, Agent State, and Mac setup banner** ([Issue #47]) —
  - `src/domains/chat/service/chat-presentation.ts` — pure presentation for Agent State
    (`Available`, `Thinking`, `Following up`, explicit-only `Paused`), Post-Message-Back
    continuity cues, and a nonblocking Mac setup banner driven by Control Plane
    `AccountState.has_desktop_client`.
  - `src/domains/chat/service/conversation-reducer.ts` — `following_up` Agent State from
    server-truth `via_post_message_back`; `Thinking` from pending outbound delivery only.
  - `src/domains/chat/ui/companion-chat.tsx` — top chrome Agent State chip, continuity dock,
    dismissible Mac setup banner near the **Account Affordance**; accepts optional
    `accountStateSource` and `agentStateOverride`.
  - `app/(chat)/index.tsx` — passes `accountStateSource` into **Companion Chat**.
  - `apps/mobile/CONTEXT.md` — Agent State vocabulary and Mac setup banner relationship.
  - Tests: extended `chat-presentation.test.mjs`, `companion-chat.rn.test.tsx`,
    `conversation-reducer.test.mjs`; AccountState fixtures include `has_desktop_client`.

- **Account Surface** ([Issue #46]) —
  - `src/domains/account/ui/account-surface.tsx` — sheet-like utility over **Companion
    Chat** (Modal, not a peer route): signed-in identity via Control Plane account
    state, coarse **Connection Status**, manual **Desktop Client** setup recovery,
    support/debug rows, and sign-out.
  - `src/domains/account/service/account-status.ts` — pure `deriveConnectionStatus`
    mapping from runtime connection state + Control Plane base URL
    (`connected` / `reconnecting` / `connection_issue` / `not_configured`).
  - `src/providers/account-state/` — `AccountStateSource` seam +
    `createControlPlaneAccountStateSource` (`GET /me` via injected JWT + fetch);
    shared by Launch State hydration and the Account Surface.
  - `app/(chat)/index.tsx` — wires Account Affordance → Account Surface; logout
    calls `AuthAdapter.signOut()` then `markSignedOut()` on Launch State.
  - Tests: `account-status.test.mjs`, `control-plane-account-state-source.test.mjs`,
    `account-surface.rn.test.tsx`; `companion-chat.rn.test.tsx` covers affordance
    open callback.

- **Failed user message retry** ([Issue #44]) — `RuntimeAdapter.retryUserMessage(messageId)`
  re-queues a failed outbound `user_message` with the same `message_id`, body, and
  `sent_at` (idempotency key preserved; reconciles to one confirmed row). The
  conversation reducer adds `retry_failed_user_message` to flip local **Delivery
  Status** back to `pending`; `mark_pending_failed` is now a no-op when nothing is
  pending. Tests also cover empty `hello_ok` cold connect, malformed snapshot
  rejection at the Protocol boundary, and retry/reconcile paths in
  `runtime-adapter.test.mjs` and `conversation-reducer.test.mjs`.

- **Device timezone on connect** ([Issue #83]) — the Runtime Adapter now reports
  the device IANA zone as optional `client_tz` on every `connect` frame so the
  Runtime can resolve wall-clock Cron schedules while the user is offline (Runtime
  ADR-0025). Resolution is injected via a new `resolveTimeZone` dep (defaulting to
  `Intl.DateTimeFormat().resolvedOptions().timeZone`) and read inside `onopen`, so
  each reconnect re-reports (travel-correct, last-write-wins). The field is omitted
  when the platform cannot resolve a zone (Runtime falls back to UTC).
  `src/domains/chat/runtime/runtime-adapter.ts`; covered by
  `test/runtime-adapter.test.mjs`.

- **Protocol Runtime Adapter** ([Issue #33]) —
  - `src/domains/chat/runtime/runtime-adapter.ts` — Protocol WebSocket client that
    owns the in-memory **Message Store**, queues outbound frames until `hello_ok`,
    and binds to assistant-ui via `useExternalStoreRuntime` ([ADR 0015](adr/0015-mobile-push-external-store-runtime-for-proactive-companion.md)).
  - `src/domains/chat/service/conversation-reducer.ts` — pure merge/dedupe for
    reconnect snapshots, history backfill, and live `companion_message` events.
  - `src/domains/chat/service/routing-client.ts` — Control Plane `GET /agent`
    client consumed by the Runtime Adapter.
  - `src/domains/chat/ui/use-companion-runtime.ts` — external-store binding seam
    between the Runtime Adapter and Intentive Chat Components.
  - `src/domains/chat/runtime/dev-transport.ts` — dev WebSocket fixture for tests
    and local harnesses (replaces the turn-based dev adapter).
  - [ADR 0016](adr/0016-mobile-no-client-authored-opening-idempotent-by-store.md) —
    server-authored opening idempotency via Message Store dedupe (no client-side
    first-opening tracker).
  - Tests: `runtime-adapter.test.mjs`, `conversation-reducer.test.mjs`,
    `routing-client.test.mjs`, `dev-transport.test.mjs`; `companion-chat.rn.test.tsx`
    updated for the external-store path.

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

- **Consent Primer copy + policy links** — replaced omi placeholder disclosure with
  Intentive-accurate data-processing copy; Privacy Policy and Terms of Service open
  `https://heyintentive.com/privacy` and `/terms`. Tests: `consent-primer.rn.test.tsx`.

- **Consent Primer → Data & Privacy** ([ADR 0020](adr/0020-mobile-consent-primer-is-data-and-privacy-acceptance.md))
  — Intentive-accurate data-processing disclosure with links to
  `https://heyintentive.com/privacy` and `/terms`. Full legal pages on the marketing
  site remain a pre-ship dependency ([`docs/BACKLOGS.md`](BACKLOGS.md)).

- **Notification permission prompt** — the OS ask now fires in the Onboarding funnel's
  Grant Permissions step (omi-style: ask on Continue, always advance); Expo Push Token
  registration still happens around first chat entry and does not re-prompt once
  permission is decided ([ADR 0018](adr/0018-mobile-pre-chat-funnel-minimum.md),
  [ADR 0019](adr/0019-mobile-onboarding-funnel-collapses-to-one-gate.md)).

- **Pre-commit hook** (repo root) — `.husky/pre-commit` now runs `pnpm hooks:pre-commit`
  (`tools/hooks/run-pre-commit.sh`): `check-staged.mjs` safety rails, then `lint-staged`.
  `lint-staged` now includes `packages/*/src/**` and drops markdown from Prettier
  staging (see [`tools/hooks/README.md`](../../../tools/hooks/README.md)).

- **Chat composition layer** — `src/entrypoints/chat-entry.tsx` (`ChatEntry`) is the
  lint-safe cross-domain composition root: Runtime Adapter wiring, Account State
  projection, `CompanionChat`, and the `AccountSurface` sheet. The `(chat)/` route is
  navigation-only (`<ChatEntry/>`); `chat/ui` no longer imports `account/ui`.
  `useOptionalAuthAdapter()` supports test/production injection at the entrypoint.
- **Message Store interface** — `service/message-store.ts` is the Runtime Adapter's
  intent-named stateful seam over the pure `conversation-reducer` engine
  (`replaceServerWindow`, `prependServerPage`, `appendCompanionMessage`, …). Internal
  reducer events use `append_companion_message` (domain shape) distinct from Protocol
  wire `companion_message`. Tests: `message-store.test.mjs`.
- **Account State projection** — `useAccountStateProjection` in
  `providers/account-state/projection.tsx` holds the shared read-through view;
  `CompanionChat` and `AccountSurface` render projected `accountState` instead of
  reading `AccountStateSource` themselves. Tests: `account-state-projection.rn.test.tsx`,
  `chat-entry.rn.test.tsx` (cross-domain composition tracer).

- **Shared theme + dark mode** ([Issue #48]) —
  - `src/design/theme.ts` — centralized `lightTheme` / `darkTheme`,
    `useMobileTheme()`, and `resolveMobileTheme()` from system appearance.
  - `identity-gate.tsx`, `companion-chat.tsx`, `account-surface.tsx` — consume
    semantic theme tokens instead of hard-coded colors.
  - Tests: dark appearance token coverage in `identity-gate.rn.test.tsx`,
    `companion-chat.rn.test.tsx`, `account-surface.rn.test.tsx`.
  - Expo SDK patch bumps (`expo@56.0.12`, router/metro/constants/network/jest-expo
    alignments).

- **Launch State hydration** ([Issue #46]) — `createControlPlaneLaunchStateSource` now
  reads `GET /me` through the shared `AccountStateSource`
  (`createControlPlaneAccountStateSource`) instead of inlining the fetch/parse path.
  `LaunchStateProvider` adds `markSignedOut()` for Account Surface logout.

- **Companion Chat runtime** ([Issue #33]) — `CompanionChat` now renders from the
  Runtime Adapter's push-side **Message Store** (`useExternalStoreRuntime`) instead
  of the #22 turn-based `ChatModelAdapter`; `app/(chat)/index.tsx` wires
  `createRuntimeAdapter` at the composition root. Outbound delivery queues until
  `hello_ok`, retries routing failures, marks pending sends `failed` on terminal
  errors, splits reconnect snapshots from history backfill to preserve order, and
  ignores stale socket/routing callbacks across reconnect generations.

- **Liquid Glass chat shell + Floating Composer** ([Issue #45]) — Companion Chat
  now uses Liquid Glass surfaces where available, a floating bottom composer with
  keyboard/safe-area padding, a quiet account affordance, and a protected opening
  flow. While the opening is arriving, drafts stay editable but do not auto-send
  later; opening failures retry the Companion-authored opening only and leave the
  draft untouched.
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

- **Dev chat adapter** ([Issue #33]) — `src/domains/chat/runtime/dev-chat-adapter.ts`
  and `test/dev-chat-adapter.test.mjs` (superseded by Runtime Adapter +
  `dev-transport.ts`).
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
- **CI** — `test:rn` remains opt-in locally; root `pnpm test` runs Node mobile tests
  only (see `docs/TESTING.md`).
- The **Message Store** remains in-memory and server-truth only — no durable local
  transcript cache until measured latency proves one is needed.

[Issue #18]: https://github.com/sruj75/Intentive/issues/18
[Issue #19]: https://github.com/sruj75/Intentive/issues/19
[Issue #20]: https://github.com/sruj75/Intentive/issues/20
[Issue #21]: https://github.com/sruj75/Intentive/issues/21
[Issue #22]: https://github.com/sruj75/Intentive/issues/22
[Issue #23]: https://github.com/sruj75/Intentive/issues/23
[Issue #33]: https://github.com/sruj75/Intentive/issues/33
[Issue #44]: https://github.com/sruj75/Intentive/issues/44
[Issue #45]: https://github.com/sruj75/Intentive/issues/45
[Issue #46]: https://github.com/sruj75/Intentive/issues/46
[Issue #47]: https://github.com/sruj75/Intentive/issues/47
[Issue #48]: https://github.com/sruj75/Intentive/issues/48
[Issue #49]: https://github.com/sruj75/Intentive/issues/49
[Issue #83]: https://github.com/sruj75/Intentive/issues/83
