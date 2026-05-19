# Intentive

macOS background service that captures on-device activity via [ScreenPipe](https://github.com/mediar-ai/screenpipe), summarizes it into **Context Snapshots**, and pushes them to an **OpenClaw Agent**. v1 is infrastructure only — no in-app agent reasoning.

**Stack:** Tauri 2 (Rust) + React + TypeScript (Vite). **Platform:** macOS only.

## How it works

1. User starts a **Capture Session** from the menu bar (target UX; see [implementation status](#implementation-status)).
2. Intentive runs ScreenPipe and watches for meaningful activity.
3. The **Context Heartbeat** (60s cadence) builds a sanitized prose **Context Snapshot** using an on-device **LLM Provider** (Apple Intelligence → existing Ollama → bundled Ollama).
4. Snapshots are written to a local SQLite log, then **pushed** over HTTPS to the OpenClaw Agent when the user is signed in.

```
ScreenPipe ──HTTP/WS──► Intentive (Rust) ──HTTPS POST──► OpenClaw Agent
Ollama / Apple Intel ──►   Context Heartbeat
                           Menu bar + settings (React)
```

Details: [`ARCHITECTURE.md`](ARCHITECTURE.md). Domain terms: [`CONTEXT.md`](CONTEXT.md).

## Prerequisites

- macOS (v1 target)
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

Core Rust modules exist for **`llm_provider`** and **`agent_interface`**. ScreenPipe lifecycle, Context Heartbeat, snapshot store, menu bar shell, and auth are specified in [`SPEC.md`](SPEC.md) but not fully wired in `src-tauri/src/lib.rs` yet. The UI is still the default Tauri window, not the menu bar agent described in [ADR-0003](docs/adr/0003-menu-bar-only-ui-v1.md).

## Repository layout

| Path | Role |
| --- | --- |
| `src/` | React UI |
| `src-tauri/` | Tauri app, orchestration, and Rust domains |
| `src-tauri/src/llm_provider/` | On-device summarization |
| `src-tauri/src/agent_interface/` | HTTPS push to OpenClaw Agent |
| `references/` | ScreenPipe / Ollama API notes |
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
- **Release** (`.github/workflows/release.yml`): macOS app build on `v*` tags.

## IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

Private repository (`package.json` marks the project as private). License terms are not defined in-repo yet.
