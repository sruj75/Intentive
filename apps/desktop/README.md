# Desktop Client

The macOS Tauri app at `apps/desktop/`. **Capture-only in v1** — runs ScreenPipe, produces Context Snapshots, manages capture state from the menu bar, and exposes Account/Settings via Neon Auth UI. **No chat UI.**

For vocabulary, see [`CONTEXT.md`](CONTEXT.md) (and the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md)). For deployable structure, see [`ARCHITECTURE.md`](ARCHITECTURE.md); for monorepo-wide layer rule and topology, see [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md). For per-deployable working rules, see [`AGENTS.md`](AGENTS.md).

## Stack

- Tauri 2 (Rust) + React + TypeScript (Vite)
- Apple Silicon macOS only in v1 (Intel deferred — see `docs/adr/0020-desktop-macos-cpu-variants-for-bundled-native-artifacts.md` at the repo root)

## Prerequisites

- macOS on Apple Silicon (M-series)
- Node.js 22+ and npm
- Rust (stable)
- Xcode Command Line Tools

## Development

```bash
# from this directory
npm install
npm run tauri dev    # full app
npm test             # frontend unit tests
npm run build        # tsc + production frontend bundle

# Rust parity (matches CI)
cargo check   --manifest-path src-tauri/Cargo.toml
cargo test    --manifest-path src-tauri/Cargo.toml
cargo clippy  --manifest-path src-tauri/Cargo.toml -- -D warnings
```

## Environment

Copy [`.env.example`](.env.example) to `.env` for local development (Neon Auth, Control Plane Routing, optional Sentry — see [ADR-0025](docs/adr/0025-desktop-sentry-errors-only-observability.md)).

Frontend (`.env` or shell):

```bash
VITE_NEON_AUTH_URL=<Neon Auth URL>
```

Rust routing (optional — see [`ARCHITECTURE.md`](ARCHITECTURE.md) Cross-cutting Concerns):

```bash
INTENTIVE_CONTROL_PLANE_URL=<Control Plane base URL>   # live GET /agent
INTENTIVE_DESKTOP_ROUTING_FIXTURE='{"ws_url":"...","runtime_jwt":"...","agent_instance_id":"..."}'  # dev/smoke without Control Plane
```

Signed-in Capture Session smoke (#35) — **dev-only**, read solely under
`#[cfg(debug_assertions)]`, absent from the notarized release. The harness sets
these for you; see [`docs/SMOKE.md`](docs/SMOKE.md):

```bash
INTENTIVE_HEARTBEAT_INTERVAL_SECS=30   # compress the 600s cadence for the smoke
INTENTIVE_SMOKE_STUB_SUMMARIZER=1      # deterministic summary so ticks never skip (ScreenPipe still real)
INTENTIVE_SMOKE_LOGIN_TOKEN=<jwt>      # inject a login token at startup for an AFK GET /agent run
INTENTIVE_SMOKE_CAPTURE_SIGNED_IN=1    # drive the capture FSM to signed-in so capture auto-starts AFK
INTENTIVE_SMOKE_LOG=<path>             # append the structured SMOKE {json} trace to a file
SCREENPIPE_API_KEY=<token>             # optional for manual runs; smoke harness loads it from the bundled binary
```

## Release

v1 ships a Developer ID signed and notarized Apple Silicon `.dmg` containing only `Intentive.app`. The release pipeline lives in the monorepo's `.github/workflows/desktop-release.yml`. `tauri dev` is not a valid final-evidence build for macOS Privacy Settings identity.

See [`CHANGELOG.md`](docs/CHANGELOG.md) for user-visible changes.

For local Routing/WebSocket smoke without Control Plane, see [`docs/TESTING.md` § Routing session smoke](../../docs/TESTING.md#routing-session-smoke-local). For the full signed-in Capture Session chain (#35), see [`docs/SMOKE.md`](docs/SMOKE.md).
