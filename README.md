# Intentive

macOS background service that captures on-device activity via [ScreenPipe](https://github.com/screenpipe/screenpipe), summarizes it into **Context Snapshots**, and pushes them to an **OpenClaw Agent**. v1 is infrastructure only — no in-app agent reasoning.

**Stack:** Tauri 2 (Rust) + React + TypeScript (Vite). **Platform:** Apple Silicon macOS for v1.

## How it works

1. A signed-in, capture-ready launch starts a **Capture Session** automatically; the menu bar toggle stops or restarts capture.
2. Intentive runs ScreenPipe and queries its local HTTP API for each activity window.
3. The **Context Heartbeat** (fixed 10-minute cadence) builds a sanitized prose **Context Snapshot** using an on-device **LLM Provider** (Apple Intelligence → existing Ollama → bundled Ollama).
4. Snapshots are written to a local SQLite log, then **pushed** over HTTPS to the OpenClaw Agent. When capture ends, Intentive sends a **Session End Marker**.

```
ScreenPipe ──HTTP/WS──► Intentive (Rust) ──HTTPS POST──► OpenClaw Agent
Ollama / Apple Intel ──►   Context Heartbeat
                           Menu bar + settings (React)
```

Details: [`ARCHITECTURE.md`](ARCHITECTURE.md). Domain terms: [`CONTEXT.md`](CONTEXT.md).

## Prerequisites

- macOS on **Apple Silicon (M-series)** — v1 does not support Intel Macs (ADR-0014)
- [Node.js](https://nodejs.org/) 22+ and npm
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Xcode Command Line Tools (for native builds)

## Development

From the repository root:

```bash
npm install
npm run tauri dev    # full app (preferred)
npm test             # frontend unit tests
npm run build        # tsc + production frontend bundle
```

Rust (CI parity):

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

`npm run dev` starts Vite alone; Tauri starts it automatically during `tauri dev`.

### Implementation status

Core Rust modules exist for **`capture_session`**, **`capture_state`**, **`screenpipe_supervisor`**, **`menu_bar`**, **`llm_provider`**, **`agent_interface`**, **`snapshot`**, and **`snapshot_store`**. `src-tauri/src/lib.rs` wires the menu bar shell, the Capture Session coordinator, the ScreenPipe supervisor, and the snapshot store (opened at `~/Library/Application Support/<bundle-id>/intentive.db`). `src/` renders the Settings/Auth surface with Neon Auth UI. Context Heartbeat, Session End Marker delivery, Capture Permission Setup, release packaging, and Auth-resolved Agent Interface configuration are specified in [`SPEC.md`](SPEC.md) but not yet wired.

### Environment

The Settings/Auth surface requires:

```bash
VITE_NEON_AUTH_URL=<Neon Auth URL from the Neon Console>
```

`VITE_NEON_DATA_API_URL` is known for the current Neon project but intentionally unused until Auth-resolved Agent Interface configuration lands.

## Repository layout

| Path | Role |
| --- | --- |
| `src/` | React UI |
| `src-tauri/` | Tauri app, orchestration, and Rust domains |
| `src-tauri/src/capture_state/` | Capture Session shell state machine (pure FSM) |
| `src-tauri/src/capture_session/` | Capture Session coordinator — owns the FSM, accepts domain commands, notifies observers |
| `src-tauri/src/screenpipe_supervisor/` | ScreenPipe child-process lifecycle (spawn, port probe, silent retry, intent flag) |
| `src-tauri/src/menu_bar/` | Tauri tray icon, menu descriptors, and command handlers |
| `src-tauri/src/llm_provider/` | On-device summarization |
| `src-tauri/src/agent_interface/` | HTTPS push to OpenClaw Agent |
| `src-tauri/src/snapshot/` | Shared `ContextSnapshot` domain type |
| `src-tauri/src/snapshot_store/` | Local SQLite log + retention (ADR-0007) |
| `src-tauri/migrations/` | sqlx-managed schema migrations |
| `src-tauri/resources/` | Bundled native artifacts (ScreenPipe, Ollama) |
| `docs/adr/` | Architectural decision records |

Full codemap and invariants: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Documentation

| Doc | Purpose |
| --- | --- |
| [`CONTEXT.md`](CONTEXT.md) | Glossary and domain language |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System design, boundaries, codemap |
| [`SPEC.md`](SPEC.md) | v1 requirements and contracts |
| [`DESIGN.md`](DESIGN.md) | Brand and UX design system |
| [`PRD.md`](PRD.md) | Product requirements |
| [`docs/adr/`](docs/adr/) | ADRs |
| [`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md) | Agent/coding-assistant instructions |

## CI and releases

- **CI** (`.github/workflows/ci.yml`): frontend typecheck, build, Vitest; Rust check, clippy, tests on every PR and push to `main`.
- **Release** (`.github/workflows/release.yml`): v1 release target is a Developer ID signed and notarized Apple Silicon DMG containing only `Intentive.app`; `tauri dev` is not valid final evidence for macOS Privacy Settings identity.

## IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

Private repository (`package.json` marks the project as private). License terms are not defined in-repo yet.
