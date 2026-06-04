# Testing

Tests are the verification oracle for agent-authored changes. A green pull request should mean typecheck, lint, contract tests, desktop frontend tests, and desktop Rust tests all ran.

## Root Commands

Run these from the repository root:

```bash
pnpm typecheck
pnpm lint
pnpm lint:architecture:rust
pnpm test
pnpm coverage
```

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
pnpm --dir apps/mobile test       # build + Node tests (auth adapter, launch resolver/source/route, route-for-destination)
pnpm --dir apps/mobile test:rn    # Jest / React Native harness (gates #19–#21, CompanionChat / Chat Primitive Engine spike #22)
pnpm --dir apps/mobile typecheck
```

The root `pnpm test` runs the Node `test` script above. `test:rn` is opt-in until CI wires it.

## Scaffold Deployables

`services/control-plane` and `services/agent-runtime` still use minimal scaffold tests. `apps/mobile` adds auth-adapter, launch-state resolver/source, and `route-for-destination` tests (Node), Pre-Chat Gate screen tests (#19–#21, RN), and Chat Primitive Engine spike tests (`companion-chat.rn.test.tsx`, `dev-chat-adapter.test.mjs`). Protocol/runtime adapter coverage grows with #33.

## CI Expectations

- `.github/workflows/monorepo-foundation.yml` is the root PR gate for typecheck, lint, architecture lint tests, and `pnpm test`.
- `.github/workflows/desktop-ci.yml` runs desktop frontend and Rust checks when desktop-relevant paths change.
- `.github/workflows/desktop-audit.yml` runs dependency audits for pnpm and Cargo.
- `.github/workflows/coverage.yml` uploads desktop JS coverage as a GitHub Actions artifact and sends LCOV to Codecov when configured.
