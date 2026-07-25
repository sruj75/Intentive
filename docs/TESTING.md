# Testing

Tests are the verification oracle for agent-authored changes. A green pull request should mean typecheck, lint, contract tests, deployable tests, and the relevant scoped harnesses all ran.

## Root Commands

Run these from the repository root:

```bash
pnpm harness
pnpm harness --group repo-contracts
pnpm harness --group node-workspaces
pnpm harness --group desktop-swift
pnpm harness --scope apps/mobile
pnpm ci:contracts
pnpm ci:dependency-exceptions
pnpm ci:shell-portability
pnpm sensor:impact-radius
pnpm sensor:contract-drift
pnpm sensor:harness-health
pnpm sensor:factory-report
pnpm sensor:factory-report --audit
pnpm factory:ledger
pnpm factory:recommend --report factory-report.md
pnpm factory:test
pnpm docs:factory:test
pnpm docs:agents:test
pnpm typecheck
pnpm lint
pnpm test
pnpm coverage
```

- `pnpm harness` is the preferred agent pre-handoff command. It composes the same three Gate modules that CI runs independently: `repo-contracts`, `node-workspaces`, and `desktop-swift`.
- `pnpm harness --group <group>` runs one independently executable Gate module. CI runs the three groups in parallel and joins them behind the stable `Gate` status.
- Desktop’s three explicit verification tiers are `pnpm --dir apps/desktop desktop:check` (deterministic Swift tests, coverage, and bundle contract), `desktop:accept` (assembled Accessibility journeys on the dedicated Mac), and `desktop:release-proof` (signed installed-DMG, Sparkle N-1, Tart TCC, and signed-in proof).
- `pnpm harness --scope <deployable>` runs the deployable harness template from `tools/harness/`, printing the owning context docs, relevant ADR dirs, high-risk shared packages, common failure modes, sensors, and focused commands. Supported scopes are `apps/mobile`, `apps/desktop`, `services/control-plane`, and `services/agent-runtime`.
- `pnpm sensor:impact-radius` is the preferred pre-review triage sensor. It reports coupling and affected workspace hints for the current change set, and remains advisory in CI.
- `pnpm sensor:contract-drift` is a hard-gated architecture sensor. It fails when deployables redefine `@intentive/protocol` wire events or `@intentive/api-contract` HTTP contracts locally.
- `pnpm sensor:harness-health` emits the advisory Ready-for-review drift report used by the PR sticky comment workflow. Treat the sticky comment as a factory feedback loop: fix current drift when it belongs in the change, improve the harness when the finding repeats, or backlog/accept the finding with rationale.
- `pnpm sensor:factory-report` is Radar: it aggregates impact-radius and harness-health into the sticky PR handoff report, adds stable finding IDs, compares against `docs/factory/LEDGER.md`, and shows changed-file or learning findings by default. Use `--audit` for full repo-wide sensor details.
- `pnpm factory:ledger` refreshes finding counts in `docs/factory/LEDGER.md` from the current change set or a saved report. It preserves human statuses such as accepted, backlogged, and factory-improved.
- `pnpm factory:recommend --report <file>` reads a saved sticky comment or factory report, compares it against the ledger, and writes grouped recommendations to `.context/factory-recommendations.md` for the recommendation-only Conductor agent pass described in `docs/factory/SELF-IMPROVEMENT.md`.
- `pnpm factory:test` runs fixture tests for finding IDs, ledger updates, and recommendation generation.
- `pnpm docs:factory:test` fixture-tests the structural contracts for `docs/factory/` files that run inside `pnpm docs:check`.
- `pnpm docs:agents:test` fixture-tests the structural `AGENTS.md` / `CLAUDE.md` integrity checker that runs inside `pnpm docs:check`.
- `pnpm typecheck` runs every workspace typecheck through Turbo.
- `pnpm lint` checks documentation links and architecture lint rules (TS).
- `pnpm test` runs every workspace with a `test` script, including Desktop SwiftPM tests, shared contract tests, architecture lint tests, and deployable tests.
- `pnpm coverage` runs Desktop Swift tests with coverage, writes the complete LLVM JSON export to `.context/coverage/desktop-swift.json`, and writes a reviewable maintained-source summary beside it.

## Sensor Timing

| Moment                           | Run                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------- |
| While diagnosing                 | Small focused tests, typecheck for the touched workspace, relevant sensor scripts |
| Before handoff                   | `pnpm harness`                                                                    |
| Before review on broad changes   | `pnpm sensor:impact-radius` plus `pnpm harness`                                   |
| When touching shared contracts   | `pnpm sensor:contract-drift`, package tests, then `pnpm harness`                  |
| When changing architecture rules | Architecture linter fixture tests, affected lints, then `pnpm harness`            |
| In CI                            | Re-run the deterministic factory on clean infrastructure                          |

Factory model: [`docs/FACTORY.md`](FACTORY.md). Self-improvement loop: [`docs/factory/SELF-IMPROVEMENT.md`](factory/SELF-IMPROVEMENT.md).

## Behavior Coverage

`tools/harness/behavior-proof.json` maps product-critical behavior slices to existing scoped harness commands. `pnpm sensor:factory-report` reports changed-workspace behavior coverage in Radar. This is advisory; the commands still run through `pnpm harness` and the deployable harness templates.

## Desktop

Desktop is a SwiftPM macOS app:

```bash
pnpm --dir apps/desktop build
pnpm --dir apps/desktop test
```

The target monorepo gate is `pnpm harness --scope apps/desktop`.

The final assembled acceptance tracer is:

```bash
pnpm --dir apps/desktop desktop:accept
```

It launches an actual isolated-profile app bundle and drives its real controls through an external macOS Accessibility process. The debug-only loopback bridge is limited to fixtures, Runtime-link/ack faults, and snapshots; it cannot invoke user actions. Evidence is assertion-derived and step-level. The runner must already have Accessibility permission. Signed/notarized artifact launch, N-1 Sparkle update proof, live signed-in full-stack proof, and Tart TCC prompts remain dedicated-Mac release gates; see [`apps/desktop/docs/RELEASE.md`](../apps/desktop/docs/RELEASE.md).

### Routing session smoke (local)

Exercise the Runtime Bridge without a live Control Plane:

1. Stand up a reachable Agent Runtime gateway, or a local WebSocket stub that accepts the Protocol `connect` handshake (`client_kind: "desktop"` + JWT).
2. Export fixture Routing before launch (fixture wins over `INTENTIVE_CONTROL_PLANE_URL` when both are set):

```bash
export INTENTIVE_DESKTOP_ROUTING_FIXTURE='{"ws_url":"wss://localhost:8787/ws","runtime_jwt":"<jwt>","agent_instance_id":"agent_dev"}'
cd apps/desktop/macos && ./run.sh
```

3. Open the app and confirm the Runtime Bridge surface can enqueue chat before `hello_ok`.
4. Expect `RuntimeAdapter` tests to prove **Connecting** -> **Connected**, generation invalidation, FIFO flush, and delivery acknowledgements.

For live Control Plane routing, set `INTENTIVE_CONTROL_PLANE_URL` instead of the fixture. A malformed fixture should fall back to Control Plane when that URL is set.

See also [`apps/desktop/README.md`](../apps/desktop/README.md) and [`apps/desktop/CONTEXT.md`](../apps/desktop/CONTEXT.md).

### Signed-in Capture Session smoke

The **signed-in Capture Session smoke** proves the full assembled chain on a real, signed-in Mac: Routing from Control Plane -> capture permission setup -> Screen Memory local record -> Desktop Context Compiler emits a sanitized `perception_event` -> Runtime records it in `runtime_events` and `perception_records` -> floating-bar chat joins the shared Conversation History -> Post-Message-Back reaches the Effect Runner.

```bash
pnpm harness --scope apps/desktop
```

It requires a Mac with the needed local grants. Full runbook and dev-only env vars: [`apps/desktop/docs/SMOKE.md`](../apps/desktop/docs/SMOKE.md).

### Reliability & privacy verification map

Desktop privacy and reliability verification collapses into three guarantees:
**A** local boundary invariants, **B** cross-language Protocol fixture contract,
and **C** redaction/privacy efficacy. See [`apps/desktop/docs/EVAL.md`](../apps/desktop/docs/EVAL.md).

## Shared Contracts

`packages/protocol` and `packages/api-contract` own wire and HTTP shapes. Contract changes must update the schemas and their Node tests together:

```bash
pnpm --dir packages/protocol test
pnpm --dir packages/api-contract test
```

`packages/providers` owns cross-cutting behavior (auth, telemetry, observability bootstrap, flags). Auth tests run a fake JWKS HTTP server to exercise the real fetch path; observability/telemetry tests cover Sentry/Langfuse bootstrap and redacted structured logging — no mocking of internal collaborators:

```bash
pnpm --dir packages/providers test
```

## Mobile Client

```bash
pnpm --dir apps/mobile test       # build + Node tests (onboarding, education, profile, local Conversation Session, plus dormant production adapters)
pnpm --dir apps/mobile test:rn    # Jest / React Native harness (two-zone A-to-L journey, Router boundaries, 19 golden snapshots, zero-call boundaries, and dormant Account State projection)
pnpm --dir apps/mobile typecheck
```

The root `pnpm test` runs the Node `test` script above. The React Native harness
is included in the blocking root harness through `pnpm --dir apps/mobile test:rn`
(`pnpm harness` locally, the `node-workspaces` Gate group in CI), so run it directly for focused
mobile UI debugging. The mounted experience is frontend-only: its RN journey
tests assert zero auth-provider, Contacts, notification, fetch, WebSocket,
SecureStore, and durable-storage calls. Named render snapshots cover A, B1/B2,
C, D, E, F, G, all five education states, K1/K2, and L1-L4 at 390×844.

### iOS simulator verification (visual / on-device)

Unit tests don't cover native rendering. To verify a change visually on the iOS
Simulator (e.g. via XcodeBuildMCP `build_run_sim` or `expo run:ios`):

1. **Start Metro first, from `apps/mobile`** — `pnpm --dir apps/mobile dev`. A Debug
   build loads JS from Metro at `localhost:8082`. Starting it from the repo root makes
   Metro pick the wrong project root and every bundle 404s (`Unable to resolve ./index`).
2. **Repo path must contain no spaces** — CocoaPods/Ruby resolves the real path and a
   space (e.g. the old `Desktop/Hey Intentive`) breaks `pod install` and the build. The
   working tree is now `Desktop/Intentive`; keep it space-free.
3. **Walk the complete A-to-L journey** — start at A, exercise invalid and
   valid name entry, advance through C/D, confirm E is the welcome state of the
   shared chat surface, open F/G, complete or skip all five education states,
   then confirm K is the ready state of that same chat surface. Focus and submit
   the Composer, observing L1 user-sent, L2 thinking, L3 composing, and L4 reply.
   Also verify drawer drag/background dismissal, keyboard clearance, top/bottom
   safe areas, disabled affordances, and that a fresh process returns to A.

#### ⚠️ Wipe DerivedData on compiler/module-cache crashes (recurs — clean build needed)

A **corrupt DerivedData / module cache** shows up as a build failure that looks like a
toolchain bug, **not** a code error. Two signatures seen so far, both the same root cause:

```
# (a) compiler frontend crash
clang: error: clang frontend command failed due to signal   # or swift-frontend
clang: error: unable to execute command: Terminated: 15

# (b) system modules fail to build from the SDK (deeper corruption)
could not build module 'Foundation' / 'CoreFoundation' / '_DarwinFoundation1'
  … from the iPhoneSimulator26.2 SDK
```

Both come with a flood of `Stale file '…' is located outside of the allowed root paths`
warnings — **those warnings are benign Xcode-26 sandbox noise** (they appear in
successful builds too); ignore them and look for the real error above. It tends to recur
after changing build settings (e.g. the bundle identifier) or reusing stale incremental
state. An incremental rebuild on the corrupt cache keeps crashing; a clean build after a
**complete** wipe succeeds reliably (~10–12 min from scratch).

**Find the DerivedData path the build actually uses, then wipe THAT — do not trust a
glob.** On this machine Xcode, the toolchain, _and_ the active DerivedData live on the
external volume **`/Volumes/T9`** (e.g. `/Volumes/T9/Developer/XcodeBuildMCP/workspaces/<ws>/DerivedData`),
**not** under `~/Library`. A `rm -rf /Volumes/*/…/DerivedData` glob silently no-ops if the
path doesn't exist _at wipe time_ or the layout differs — which is exactly how a wipe ends
up incomplete and the next build keeps failing. Confirm the real path first:

```bash
# Ask the build where DerivedData / the module cache actually are:
#   XcodeBuildMCP: show_build_settings  → look for SYMROOT / OBJROOT / MODULE_CACHE_DIR
#   or grep the failing build log for the DerivedData root:
grep -oE '/[^ ]*/DerivedData' <build-log> | sort -u
```

Then wipe **every** DerivedData root that exists (both internal and the external volume),
including the clang `ModuleCache.noindex` inside them:

```bash
rm -rf ~/Library/Developer/XcodeBuildMCP/workspaces/*/DerivedData
rm -rf /Volumes/*/Developer/XcodeBuildMCP/workspaces/*/DerivedData   # external volume — the live one here
# verify they're actually gone (no path left behind):
ls -d ~/Library/Developer/XcodeBuildMCP/workspaces/*/DerivedData \
      /Volumes/*/Developer/XcodeBuildMCP/workspaces/*/DerivedData 2>/dev/null || echo "all wiped"
```

(Plain Xcode users, not XcodeBuildMCP: `rm -rf ~/Library/Developer/Xcode/DerivedData`.)

## Control Plane

```bash
pnpm --filter ./services/control-plane test
pnpm --filter ./services/control-plane typecheck
```

The Control Plane suite includes identity and gates service/handler unit tests, HTTP routing via Hono (`app.test.mjs`), and opt-in repo integration tests against a disposable Neon branch (ADR-0003; skips when `NEON_API_KEY` / `NEON_PROJECT_ID` are unset). See `services/control-plane/test/helpers/neon-branch.mjs`. Pull requests also run `.github/workflows/neon-preview-branches.yml` when Control Plane paths change: it creates one Neon branch for the PR, applies all Control Plane migrations with `pnpm --filter ./services/control-plane migrate`, runs Control Plane checks without forwarding `NEON_*`, and deletes the branch when the PR closes.

## Agent Runtime

```bash
pnpm --filter ./services/agent-runtime test
pnpm --filter ./services/agent-runtime typecheck
```

The Agent Runtime suite currently exercises the shared config seam (`test/config-env.test.mjs`)
and the connection-control slice: Session Start idempotency, Internal API auth/body
handling, gateway `connect` handshake behavior, structured auth/protocol errors, and a
real WebSocket `hello_ok` smoke path. Domain folders are created lazily per ADR-0002 as
vertical slices land.

## Scaffold Deployables

`services/control-plane` exercises identity + cross-client gates (`GET /me`, `POST /consent`, `POST /sibling-invitation/skip`, users + user_gates repos, `migrations/0001_users.sql` and `0002_user_gates.sql`). `services/agent-runtime` has moved past contract-sample scaffolds to the `loadConfig` boot seam. `apps/mobile` exercises onboarding, education, Profile Store, and the local Conversation Session plus dormant auth, launch-state, Control Plane, Runtime Adapter, Message Store, reducer, routing, and notification modules through Node tests. Its RN axis owns the two-zone A-to-L journey, Router replacements, golden states, and dormant Account State projection.

## CI Expectations

- `.github/workflows/monorepo-foundation.yml` is the root PR Gate. It runs repository contracts on Ubuntu, Node workspaces on Ubuntu, and Desktop Swift tests plus bundle and coverage evidence on macOS. The stable `Gate` job succeeds only when all three modules pass.
- `.github/workflows/codeql.yml` is the versioned security-analysis contract. It analyzes Actions, JavaScript/TypeScript, and Swift, then joins them behind the stable `Security` status. GitHub default setup must remain disabled so its stale auto-detected language list cannot compete with this workflow.
- `.github/workflows/harness-health.yml` posts the non-blocking Radar sticky comment on non-draft pull requests. Radar is changed-file-first and keeps the full repository audit behind `--audit`; it does not execute unpinned third-party analyzers.
- `.github/workflows/neon-preview-branches.yml` creates one Neon branch per Control Plane pull request, validates migrations against it, and deletes the branch when the PR closes. Typecheck/tests belong to the Node Gate and are not replayed here.
- `.github/workflows/security-audit.yml` runs `pnpm audit --prod --audit-level moderate` on pull requests when pnpm dependency inputs change; its weekly/manual path runs the full `pnpm audit --audit-level moderate`.
- `.github/workflows/desktop-dependency-policy.yml` enforces the Desktop provider-SDK boundary. It is a dependency-policy check, not a vulnerability database scan.
- Desktop coverage is produced by the same `desktop-swift` Gate execution that runs tests; there is no separate recompilation-only coverage workflow.
