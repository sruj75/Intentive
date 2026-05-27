# Desktop Client — Agent Guide

macOS Tauri app. **Capture-only in V1 — no chat UI.** Chat lives on the Mobile Client.

**Always read first:**
- [`../../docs/CONTEXT.md`](../../docs/CONTEXT.md) — vocabulary
- [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) — layer rule

## Role in V1

- Runs the bundled **ScreenPipe** subprocess to capture screen + audio
- On a fixed 10-minute **Context Heartbeat**, summarizes the window via the **LLM Provider** (Apple Intelligence → existing Ollama → bundled Ollama, in that priority)
- Produces a **Context Snapshot** per heartbeat tick; writes it to the **Snapshot Store** (local SQLite, **local-truth, not a cache**)
- Sends each Context Snapshot to the **Agent Runtime** as a `context_snapshot` WebSocket event using **Protocol** schemas from `packages/protocol/`
- Emits a `session_end_marker` when a **Capture Session** ends
- Menu bar capture toggle + state. **No chat UI.**

## Domains

TypeScript side (`src/domains/<name>/`):
- `auth` — Neon Auth UI integration, sign-in
- `onboarding` — Capture Permission Setup flow (macOS Privacy Settings wizard)
- `menubar` — tray icon, toggle, Capture Error state
- `account` — Settings surface

Rust side (`src-tauri/src/domains/<name>/`):
- `capture` — ScreenPipe subprocess lifecycle, port management
- `summarization` — LLM Provider resolution, Context Heartbeat
- `snapshots` — Snapshot Store (sqlx), Snapshot Privacy Boundary, WebSocket delivery

## Working docs

- [`.scratch/v1-backlog/PRD.md`](.scratch/v1-backlog/PRD.md) — active Desktop backlog parent PRD, aligned with root `docs/CONTEXT.md`
- [`docs/SPEC.md`](docs/SPEC.md), [`docs/DESIGN.md`](docs/DESIGN.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Desktop-specific product/design/architecture
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — user-visible changes
- [`docs/adr/`](docs/adr/) — Desktop-specific ADRs (to be merged into root later)
- [`docs/agents/`](docs/agents/) — Desktop-specific working rules (build commands, integrations, triage)

## Stack & deploy

- React + Vite (frontend), Rust + Tauri (backend), TypeScript + sqlx
- **Apple Silicon only in V1** (Intel deferred)
- Builds, signs (Developer ID), notarizes to `.dmg` via GitHub Actions → uploads to GitHub Releases / R2 → linked from landing page
- Tauri built-in updater for in-app auto-update

## Guardrails specific to this deployable

- **No chat UI.** Desktop's WebSocket connection sends only `context_snapshot` and `session_end_marker`.
- **Snapshot Privacy Boundary is structural.** The `ContextSnapshot` Rust struct has no fields for raw ScreenPipe data. Do not add any.
- **Bundled native artifacts** match the host **Mac CPU variant**, not the signed-in user.
- ScreenPipe is an internal implementation detail — never user-visible. macOS Privacy Settings should present "Intentive" or fallback "Intentive Capture", never "ScreenPipe".
- Capture is gated by **Desktop Capture Readiness** — Control Plane confirms this Mac is ready before auto-start.
