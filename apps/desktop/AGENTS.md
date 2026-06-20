# Desktop Client — Agent Guide

macOS Tauri app. **Capture-only in V1 — no chat UI.** Chat lives on the Mobile Client.

**Read first:** [`CONTEXT.md`](CONTEXT.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), then root [`AGENTS.md`](../../AGENTS.md) Start here (testing, ADRs).

## Role in V1

- Runs the bundled **ScreenPipe** subprocess to capture screen + audio
- On a fixed 10-minute **Context Heartbeat**, summarizes the window via the **LLM Provider** (Apple Intelligence → existing Ollama → bundled Ollama, in that priority)
- Produces a **Context Snapshot** per heartbeat tick; writes it to the **Snapshot Store** (local SQLite, **local-truth, not a cache**)
- Rust owns **Routing** end-to-end (`GET /agent`, Protocol WebSocket session, reconnect). The webview re-syncs the login token via `set_login_token` / `clear_login_token` when it changes (deduped on both sides) and receives only a plain connection mood — no JWT in UI.
- Reports the Mac **IANA timezone** as optional `client_tz` on every `connect` frame (same contract as Mobile; see Runtime [ADR-0025](https://github.com/sruj75/Intentive/blob/main/services/agent-runtime/docs/adr/0025-agent-runtime-device-reported-user-timezone.md))
- Protocol event emission (`context_snapshot`, `session_end_marker`) rides the live `WsSessionAgentSink` bridge (#34) through `WsSession::try_emit`. A down socket leaves `pushed_at = null` (ADR-0005: at-most-once, no Runtime→Client ack).
- On capture **Stop**, the coordinator emits the **Session End Marker** before stopping ScreenPipe (ADR-0022).
- Menu bar capture toggle + state. **No chat UI.**

## Domains

TypeScript side (`src/domains/<name>/`; `App.tsx`/`main.tsx` are the exempt composition root):

- `auth` — Neon Auth client + UI integration, sign-in
- `onboarding` — bundled-model download (`Onboarding.tsx`) and Capture Permission Setup wizard (`CapturePermissionSetup.tsx`, `?surface=permission-setup`)
- `account` — Settings surface (Neon Auth UI + connection mood from `routing:status`, replayed on mount)

Rust side (`src-tauri/src/domains/<name>/`):

- `capture` — ScreenPipe supervisor, Capture Session coordinator, shell-state FSM (`SetupRequired` included), `permission_monitor`, port resolution
- `routing` — Control Plane `GET /agent`, Routing/Session state, Protocol WebSocket session, login-token commands
- `summarization` — LLM Provider tier resolution + bundled-model download commands
- `snapshots` — Snapshot Store (sqlx), Context Heartbeat, Snapshot Privacy Boundary, `AgentSink` seam (`WsSessionAgentSink` at `lib.rs`; `NoopAgentSink` for inert wiring)
- `menubar` — tray icon, capture toggle, Capture Error state (Rust Tauri UI)

Cross-cutting Rust helpers (port probe, macOS permission probes, dev-only smoke hooks) live in `src-tauri/src/providers/` (`providers/permissions/` implements `CapturePermissions` + `ReadinessChecker`; setup polling via `status_emitter`; `providers/smoke.rs` holds `#[cfg(debug_assertions)]` smoke env readers). Cross-domain wiring happens at the `lib.rs` composition root via trait seams (`ScreenpipeUrlSource`, `SessionHooks`, `CaptureSessionControl`, `CapturePermissions`, `Summarizer`, `AgentSink`). Layer direction is enforced by `tools/linters/rust-architecture/` (`pnpm lint:architecture:rust`).

## Working docs

- [`../../docs/prd/desktop-PRD.md`](../../docs/prd/desktop-PRD.md) — Desktop PRD
- [`docs/SPEC.md`](docs/SPEC.md), [`docs/DESIGN.md`](docs/DESIGN.md), [`ARCHITECTURE.md`](ARCHITECTURE.md) — Desktop-specific product/design/architecture
- [`docs/SMOKE.md`](docs/SMOKE.md) — signed-in Capture Session smoke runbook (#35)
- [`docs/EVAL.md`](docs/EVAL.md) — privacy efficacy eval runbook (guarantee C, #43; `pnpm eval:privacy`)
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — user-visible changes
- [`../../docs/adr/`](../../docs/adr/) — Unified ADRs (desktop entries are prefixed `desktop-` where relevant)

## Stack & deploy

- React + Vite (frontend), Rust + Tauri (backend), TypeScript + sqlx
- Local dev: `pnpm --filter ./apps/desktop dev`; tests: `pnpm --filter ./apps/desktop test` (Vitest + Rust; see [`docs/TESTING.md` § Desktop](../../docs/TESTING.md#desktop))
- Signed-in Capture Session smoke (Mac, all three grants): `pnpm --filter ./apps/desktop smoke` — runbook at [`docs/SMOKE.md`](docs/SMOKE.md)
- `pnpm lint:architecture:rust` when touching `src-tauri/`
- **Apple Silicon only in V1** (Intel deferred)
- Builds, signs (Developer ID), notarizes to `.dmg` via GitHub Actions → uploads to GitHub Releases / R2 → linked from landing page
- Tauri built-in updater for in-app auto-update

## Guardrails specific to this deployable

- **No chat UI.** Desktop's WebSocket connection sends only `context_snapshot` and `session_end_marker`.
- **`connect.client_tz`:** include the host IANA zone on every reconnect in `routing/runtime/mod.rs` (`iana_time_zone::get_timezone()` at the I/O edge; pure `build_connect_frame` helper) alongside `auth_token` / `client_kind` / `client_version`. Last report wins across devices; omit only when the OS cannot resolve a zone (Runtime falls back to UTC). Field is optional on the wire but required product behavior once Cron is live.
- **Snapshot Privacy Boundary is structural.** The `ContextSnapshot` Rust struct has no fields for raw ScreenPipe data. Do not add any.
- **Bundled native artifacts** match the host **Mac CPU variant**, not the signed-in user.
- ScreenPipe is an internal implementation detail — never user-visible. macOS Privacy Settings should present "Intentive", never "ScreenPipe" or a raw helper name.
- Capture is gated by sign-in + live **Desktop Capture Readiness** on this Mac (all three macOS grants). The Mac's local check is the interlock authority; the Control Plane capture gate is policy-only (Screen Recording signal, ADR-0020).
