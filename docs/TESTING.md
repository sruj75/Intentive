# Testing

Tests are the verification oracle for agent-authored changes. A green pull request should mean typecheck, lint, contract tests, desktop frontend tests, and desktop Rust tests all ran.

## Root Commands

Run these from the repository root:

```bash
pnpm harness
pnpm harness --scope apps/mobile
pnpm sensor:impact-radius
pnpm sensor:contract-drift
pnpm sensor:harness-health
pnpm typecheck
pnpm lint
pnpm lint:architecture:rust
pnpm test
pnpm coverage
```

- `pnpm harness` is the preferred agent pre-handoff command and the blocking CI verification command. It runs the root PR gate, the impact-radius fixture tests, and the Mobile React Native/Jest harness.
- `pnpm harness --scope <deployable>` runs the deployable harness template from `tools/harness/`, printing the owning context docs, relevant ADR dirs, high-risk shared packages, common failure modes, sensors, and focused commands. Supported scopes are `apps/mobile`, `apps/desktop`, `services/control-plane`, and `services/agent-runtime`.
- `pnpm sensor:impact-radius` is the preferred pre-review triage sensor. It reports coupling and affected workspace hints for the current change set, and remains advisory in CI.
- `pnpm sensor:contract-drift` is a hard-gated architecture sensor. It fails when deployables redefine `@intentive/protocol` wire events or `@intentive/api-contract` HTTP contracts locally.
- `pnpm sensor:harness-health` emits the advisory Ready-for-review drift report used by the PR sticky comment workflow. Treat the sticky comment as a factory feedback loop: fix current drift when it belongs in the change, improve the harness when the finding repeats, or backlog/accept the finding with rationale.
- `pnpm typecheck` runs every workspace typecheck through Turbo.
- `pnpm lint` checks documentation links and architecture lint rules (TS).
- `pnpm lint:architecture:rust` runs the custom Rust layer + structure checker (`tools/linters/rust-architecture/`) over every `apps/*/src-tauri/src/` tree as a hard gate. ESLint never parses `.rs`, so this is how the layered-domain rule reaches the Rust side. The fixture tests for both checkers run via `pnpm lint:architecture:test`.
- `pnpm test` runs every workspace with a `test` script, including desktop Vitest, desktop Rust tests, shared contract tests, architecture lint tests, and scaffold tests for deployables that are not implemented yet.
- `pnpm coverage` runs desktop Vitest coverage and writes LCOV output under `coverage/apps/desktop/`.

## Desktop

Desktop has two test surfaces:

```bash
pnpm --dir apps/desktop exec vitest run
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

The root `apps/desktop` `test` script runs both surfaces. Do not replace it with a filtered Cargo command unless the filter is only for local debugging.

## Shared Contracts

`packages/protocol` and `packages/api-contract` own wire and HTTP shapes. Contract changes must update the schemas and their Node tests together:

```bash
pnpm --dir packages/protocol test
pnpm --dir packages/api-contract test
```

`packages/providers` owns cross-cutting behavior (auth, telemetry, flags). Its tests run a fake JWKS HTTP server to exercise the real fetch path — no mocking of internal collaborators:

```bash
pnpm --dir packages/providers test
```

## Mobile Client

```bash
pnpm --dir apps/mobile test       # build + Node tests (auth adapter, launch resolver/source/route, control-plane source, account-state mapper, route-for-destination)
pnpm --dir apps/mobile test:rn    # Jest / React Native harness (gates #19–#21, CompanionChat / Chat Primitive Engine spike #22)
pnpm --dir apps/mobile typecheck
```

The root `pnpm test` runs the Node `test` script above. `test:rn` is opt-in until CI wires it.

### iOS simulator verification (visual / on-device)

Unit tests don't cover native rendering. To verify a change visually on the iOS
Simulator (e.g. via XcodeBuildMCP `build_run_sim` or `expo run:ios`):

1. **Start Metro first, from `apps/mobile`** — `pnpm --dir apps/mobile dev`. A Debug
   build loads JS from Metro at `localhost:8081`. Starting it from the repo root makes
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

The Control Plane suite includes identity service/handler unit tests, HTTP routing via Hono (`app.test.mjs`), and an opt-in repo integration test against a disposable Neon branch (ADR-0003; skips when `NEON_API_KEY` / `NEON_PROJECT_ID` are unset). See `services/control-plane/test/helpers/neon-branch.mjs`.

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

`services/control-plane` exercises the identity slice (`GET /me`, users repo, `migrations/0001_users.sql`). `services/agent-runtime` has moved past contract-sample scaffolds to the `loadConfig` boot seam. `apps/mobile` adds auth-adapter, launch-state resolver/source, control-plane launch source, `account-state-to-launch-state`, and `route-for-destination` tests (Node), Pre-Chat Gate screen tests (#19–#21, RN), and Chat Primitive Engine spike tests (`companion-chat.rn.test.tsx`, `dev-chat-adapter.test.mjs`). Protocol/runtime adapter coverage grows with #33.

## CI Expectations

- `.github/workflows/monorepo-foundation.yml` is the root PR gate for typecheck, lint, architecture lint tests, and `pnpm test`.
- `.github/workflows/control-plane-ci.yml` runs Control Plane typecheck and the full test suite (including the opt-in Neon repo integration test when repository secrets are set) on pull requests that touch `services/control-plane/` or its shared-package dependencies.
- `.github/workflows/desktop-ci.yml` runs desktop frontend and Rust checks when desktop-relevant paths change.
- `.github/workflows/desktop-audit.yml` runs dependency audits for pnpm and Cargo.
- `.github/workflows/coverage.yml` uploads desktop JS coverage as a GitHub Actions artifact and sends LCOV to Codecov when configured.
