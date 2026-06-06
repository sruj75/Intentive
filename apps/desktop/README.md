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

```bash
VITE_NEON_AUTH_URL=<Neon Auth URL>
```

## Release

v1 ships a Developer ID signed and notarized Apple Silicon `.dmg` containing only `Intentive.app`. The release pipeline lives in the monorepo's `.github/workflows/desktop-release.yml`. `tauri dev` is not a valid final-evidence build for macOS Privacy Settings identity.

See [`CHANGELOG.md`](docs/CHANGELOG.md) for user-visible changes.
