# Testing

Tests are the verification oracle for agent-authored changes. A green pull request should mean typecheck, lint, contract tests, deployable tests, and the relevant scoped harnesses all ran.

## Root Commands

Run these from the repository root:

```bash
pnpm harness
pnpm harness --scope apps/mobile
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

- `pnpm harness` is the preferred agent pre-handoff command and the blocking CI verification command. It runs the root PR gate, the impact-radius fixture tests, and the Mobile React Native/Jest harness.
- `pnpm harness --scope <deployable>` runs the deployable harness template from `tools/harness/`, printing the owning context docs, relevant ADR dirs, high-risk shared packages, common failure modes, sensors, and focused commands. Supported scopes are `apps/mobile`, `apps/desktop`, `services/control-plane`, and `services/agent-runtime`.
- `pnpm sensor:impact-radius` is the preferred pre-review triage sensor. It reports coupling and affected workspace hints for the current change set, and remains advisory in CI.
- `pnpm sensor:contract-drift` is a hard-gated architecture sensor. It fails when deployables redefine `@intentive/protocol` wire events or `@intentive/api-contract` HTTP contracts locally.
- `pnpm sensor:harness-health` emits the advisory Ready-for-review drift report used by the PR sticky comment workflow. Treat the sticky comment as a factory feedback loop: fix current drift when it belongs in the change, improve the harness when the finding repeats, or backlog/accept the finding with rationale.
- `pnpm sensor:factory-report` is Radar: it aggregates impact-radius and harness-health into the sticky PR handoff report, adds stable finding IDs, compares against `docs/factory/LEDGER.md`, and shows change-tied or learning findings by default. CI can pass `--btar-base-report` and `--btar-head-report` to fold a BTAR agent-readiness delta into the same sticky comment. Use `--audit` for full repo-wide sensor details.
- `pnpm factory:ledger` refreshes finding counts in `docs/factory/LEDGER.md` from the current change set or a saved report. It preserves human statuses such as accepted, backlogged, and factory-improved.
- `pnpm factory:recommend --report <file>` reads a saved sticky comment or factory report, compares it against the ledger, and writes grouped recommendations to `.context/factory-recommendations.md` for the recommendation-only Conductor agent pass described in `docs/factory/SELF-IMPROVEMENT.md`.
- `pnpm factory:test` runs fixture tests for finding IDs, ledger updates, and recommendation generation.
- `pnpm docs:factory:test` fixture-tests the structural contracts for `docs/factory/` files that run inside `pnpm docs:check`.
- `pnpm docs:agents:test` fixture-tests the structural `AGENTS.md` / `CLAUDE.md` integrity checker that runs inside `pnpm docs:check`.
- `pnpm typecheck` runs every workspace typecheck through Turbo.
- `pnpm lint` checks documentation links and architecture lint rules (TS).
- `pnpm test` runs every workspace with a `test` script, including Desktop SwiftPM tests, shared contract tests, architecture lint tests, and deployable tests.
- `pnpm coverage` runs the configured coverage workflow locally when a workspace exposes one; Desktop CI uses SwiftPM coverage artifacts.

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
pnpm --dir apps/desktop acceptance:assembled
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
pnpm --dir apps/mobile test       # build + Node tests (auth adapter, launch resolver/source/route, control-plane launch + account-state sources, account-state mapper, account-status, route-for-destination, runtime adapter, message store, conversation reducer, routing client, dev transport)
pnpm --dir apps/mobile test:rn    # Jest / React Native harness (gates #19–#21, CompanionChat external-store runtime, Account Surface #46, Account State projection, ChatEntry composition)
pnpm --dir apps/mobile typecheck
```

The root `pnpm test` runs the Node `test` script above. The React Native harness
is included in the blocking root harness through `pnpm --dir apps/mobile test:rn`
(`pnpm harness` locally, `pnpm harness:ci` in CI), so run it directly for focused
mobile UI/gate debugging.

### iOS simulator verification (visual / on-device)

Unit tests don't cover native rendering. To verify a change visually on the iOS
Simulator (e.g. via XcodeBuildMCP `build_run_sim` or `expo run:ios`):

1. **Start Metro first, from `apps/mobile`** — `pnpm --dir apps/mobile dev`. A Debug
   build loads JS from Metro at `localhost:8082`. Starting it from the repo root makes
   Metro pick the wrong project root and every bundle 404s (`Unable to resolve ./index`).
2. **Repo path must contain no spaces** — CocoaPods/Ruby resolves the real path and a
   space (e.g. the old `Desktop/Hey Intentive`) breaks `pod install` and the build. The
   working tree is now `Desktop/Intentive`; keep it space-free.
3. **Walk the gates to reach chat** — the app opens on the Identity Gate. Tap
   **Continue as dev → Continue → Not now** to reach `CompanionChat`. The Send button is
   a vendor `Pressable` with no AX button role, so UI-automation snapshots won't list it;
   tap it by its testID (`intentive-composer-send`).

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

`services/control-plane` exercises identity + cross-client gates (`GET /me`, `POST /consent`, `POST /sibling-invitation/skip`, users + user_gates repos, `migrations/0001_users.sql` and `0002_user_gates.sql`). `services/agent-runtime` has moved past contract-sample scaffolds to the `loadConfig` boot seam. `apps/mobile` adds auth-adapter, launch-state resolver/source, control-plane launch + account-state sources, `account-state-to-launch-state`, `account-status`, `route-for-destination`, Runtime Adapter + Message Store (`runtime-adapter`, `message-store`, `conversation-reducer`, `routing-client`, `dev-transport`) tests (Node), Pre-Chat Gate screen tests (#19–#21, RN), Companion Chat external-store tests (`companion-chat.rn.test.tsx`, #33), Account Surface tests (`account-surface.rn.test.tsx`, #46), Account State projection (`account-state-projection.rn.test.tsx`), and ChatEntry cross-domain composition (`chat-entry.rn.test.tsx`).

## CI Expectations

- `.github/workflows/monorepo-foundation.yml` is the root PR gate. Its final blocking step runs `pnpm harness:ci`, which mirrors `pnpm harness` and includes typecheck, lint, format check, architecture and sensor contract tests, contract drift, workspace tests, and Mobile React Native tests.
- `.github/workflows/harness-health.yml` posts the non-blocking Radar sticky comment on non-draft pull requests. It builds optional BTAR base/head JSON reports, then runs `pnpm sensor:factory-report` with those reports so the sticky comment can include a BTAR agent-readiness delta alongside impact-radius and harness-health. BTAR setup or analysis failures are advisory only and do not fail the job. Use `--audit` locally for full repo-wide maintenance output.
- `.github/workflows/control-plane-ci.yml` runs Control Plane typecheck and the full test suite on pull requests that touch `services/control-plane/` or its shared-package dependencies. It intentionally omits `NEON_*` so branch-spawning repo integration tests skip in PR CI.
- `.github/workflows/neon-preview-branches.yml` creates one Neon branch per Control Plane pull request, validates migrations against it, runs the Control Plane checks without creating extra Neon branches, and deletes the branch when the PR closes.
- `.github/workflows/desktop-ci.yml` runs Desktop SwiftPM build/tests and docs checks when desktop-relevant paths change.
- `.github/workflows/security-audit.yml` runs `pnpm audit --prod --audit-level high` on pull requests only when pnpm dependency inputs change; its weekly/manual path runs the full `pnpm audit --audit-level high`.
- `.github/workflows/desktop-audit.yml` audits Desktop SwiftPM dependencies and blocks provider SDKs in the app package.
- `.github/workflows/coverage.yml` uploads Desktop Swift coverage artifacts.
