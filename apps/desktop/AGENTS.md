# Desktop Client — Agent Guide

macOS Tauri app. **Capture-only in V1 — no chat UI.** Chat lives on the Mobile Client.

**Read first:** [`CONTEXT.md`](CONTEXT.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), then root [`AGENTS.md`](../../AGENTS.md) Start here (testing, ADRs).

## Role in V1

- Runs the bundled **ScreenPipe** subprocess to capture screen + audio
- On a fixed 10-minute **Context Heartbeat**, summarizes the window via the **LLM Provider** (Apple Intelligence → existing Ollama → bundled Ollama, in that priority)
- Produces a **Context Snapshot** per heartbeat tick; writes it to the **Snapshot Store** (local SQLite, **local-truth, not a cache**)
- Sends each Context Snapshot to the **Agent Runtime** as a `context_snapshot` WebSocket event using **Protocol** schemas from `packages/protocol/`
- Emits a `session_end_marker` when a **Capture Session** ends
- Menu bar capture toggle + state. **No chat UI.**

## Domains

TypeScript side (`src/domains/<name>/`; `App.tsx`/`main.tsx` are the exempt composition root):

- `auth` — Neon Auth client + UI integration, sign-in
- `onboarding` — bundled-model download / Capture Permission Setup UI
- `account` — Settings surface (planned)

Rust side (`src-tauri/src/domains/<name>/`):

- `capture` — ScreenPipe supervisor, Capture Session coordinator, shell-state FSM, port resolution
- `summarization` — LLM Provider tier resolution + bundled-model download commands
- `snapshots` — Snapshot Store (sqlx), Context Heartbeat, Snapshot Privacy Boundary, Protocol WebSocket delivery (`agent_interface`)
- `menubar` — tray icon, capture toggle, Capture Error state (Rust Tauri UI)

Cross-cutting Rust helpers (e.g. the port probe) live in `src-tauri/src/providers/`. Cross-domain wiring happens at the `lib.rs` composition root via trait seams (`ScreenpipeUrlSource`, `SessionHooks`, `CaptureSessionControl`). Layer direction is enforced by `tools/linters/rust-architecture/` (`pnpm lint:architecture:rust`).

## Working docs

- [`../../docs/prd/desktop-PRD.md`](../../docs/prd/desktop-PRD.md) — Desktop PRD
- [`docs/SPEC.md`](docs/SPEC.md), [`docs/DESIGN.md`](docs/DESIGN.md), [`ARCHITECTURE.md`](ARCHITECTURE.md) — Desktop-specific product/design/architecture
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — user-visible changes
- [`../../docs/adr/`](../../docs/adr/) — Unified ADRs (desktop entries are prefixed `desktop-` where relevant)

## Stack & deploy

- React + Vite (frontend), Rust + Tauri (backend), TypeScript + sqlx
- Local dev: `pnpm --filter ./apps/desktop dev`; tests: `pnpm --filter ./apps/desktop test` (Vitest + Rust; see [`docs/TESTING.md` § Desktop](../../docs/TESTING.md#desktop))
- `pnpm lint:architecture:rust` when touching `src-tauri/`
- **Apple Silicon only in V1** (Intel deferred)
- Builds, signs (Developer ID), notarizes to `.dmg` via GitHub Actions → uploads to GitHub Releases / R2 → linked from landing page
- Tauri built-in updater for in-app auto-update

## Guardrails specific to this deployable

- **No chat UI.** Desktop's WebSocket connection sends only `context_snapshot` and `session_end_marker`.
- **Snapshot Privacy Boundary is structural.** The `ContextSnapshot` Rust struct has no fields for raw ScreenPipe data. Do not add any.
- **Bundled native artifacts** match the host **Mac CPU variant**, not the signed-in user.
- ScreenPipe is an internal implementation detail — never user-visible. macOS Privacy Settings should present "Intentive" or fallback "Intentive Capture", never "ScreenPipe".
- Capture is gated by **Desktop Capture Readiness** — Control Plane confirms this Mac is ready before auto-start.
