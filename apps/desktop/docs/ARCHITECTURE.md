# Desktop Client Architecture

For canonical vocabulary, see `[docs/CONTEXT.md](../../docs/CONTEXT.md)` at the repo root. For cross-deployable architecture and layer rule, see `[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)`. This file describes Desktop Client-specific structure only.

Contract for v1: the Intentive Desktop Client manages ScreenPipe capture for a signed-in user only after the Control Plane confirms Desktop Capture Readiness for that Mac, runs on-device summarization, persists each **Context Snapshot** in the local **Snapshot Store** before delivery, emits it as a `context_snapshot` event on the shared WebSocket **Protocol** to the **Agent Runtime**, and emits a `session_end_marker` event when a Capture Session ends. Acceptance criteria are in `SPEC.md`; ADRs live at the repo root in `docs/adr/`.

## Bird's-eye Overview

Intentive sits between four external systems and one user:

```
┌─────────────┐     HTTP/WS         ┌──────────────┐
│  ScreenPipe │◄──────────────--───►│              │
│  (child)    │  :44380 or :44382   │   Intentive  │
└─────────────┘                     │  (Tauri/Rust)│
                                    │              │
┌─────────────┐     HTTP            │  ┌────────┐  │   WebSocket Protocol
│ Ollama /    │◄────────────────────┼──│ Heart- │──┼─── context_snapshot ──► Agent Runtime
│ Apple Intel │  :11434 (existing)  │  │ beat   │  │   session_end_marker    (always-alive
│             │  :44381 / :44383    │  │        │  │   (JWT once at connect) GCE VM)
└─────────────┘   (bundled Ollama)  │  └────────┘  │
                                    │      │       │
                                    │ Snapshot     │
                                    │ Store (SQLite│
                                    │  local-truth)│
                                    └──────┬───────┘
                                           │ Tauri invoke / events
                                    ┌──────▼──────────┐
                                    │ Menu bar +      │
                                    │ Settings (React)│◄── Neon Auth
                                    └─────────────────┘

(Control Plane is consulted at sign-in for Routing — Agent Runtime URL + JWT
 via `GET /agent` — and again for Desktop Capture Readiness, but it is
 never on the WebSocket data path.)
```

**Capture Session** — Capture starts automatically when a signed-in user launches the Desktop Client and the Control Plane confirms **Desktop Capture Readiness** for that registered Mac. The Desktop Client spawns ScreenPipe and runs the **Context Heartbeat** on a fixed 10-minute cadence. Each cycle: query ScreenPipe for the preceding activity window → summarize via **LLM Provider** → write **Context Snapshot** into the **Snapshot Store** → emit it as a `context_snapshot` event on the WebSocket to the **Agent Runtime**. Stop, quit, or ScreenPipe crash ends the Capture Session and emits a `session_end_marker` event before teardown. Mobile onboarding never authorizes Mac screen capture.

**Current implementation state** — The repo is past starter scaffold for Rust domains (`capture_session`, `capture_state`, `context_heartbeat`, `screenpipe_supervisor`, `menu_bar`, `llm_provider`, `agent_interface`, `snapshot`, `snapshot_store`). The `agent_interface` Rust module is the internal name for the Protocol WebSocket emitter; the wire concept is the Protocol from `packages/protocol/`. `lib.rs` constructs the ScreenPipe supervisor and Capture Session coordinator, spawns the coordinator event loop, installs the menu bar shell as a state observer, wires the Snapshot Store (`BaseDirectory::AppLocalData/intentive.db`), and installs Context Heartbeat into coordinator lifecycle hooks. Heartbeat ticks persist snapshots before delivery attempts and stamp `pushed_at` only on `delivery_ack`. `session_end_marker` emission is wired at the call site with a currently stubbed Protocol target pending the Agent Runtime gateway. `src/` renders a Neon Auth Settings surface; Routing (Agent Runtime URL + JWT via Control Plane's `GET /agent`) remains planned.

**Platform** — macOS only, **Apple Silicon (M-series) only** for v1 (ADR-0014). No Windows/Linux, no Intel Macs in v1, no in-app agent reasoning, no client-side retry queue in v1 (delivery is at-most-once with reconnect-snapshot recovery per the Protocol).

## Codemap


| Path                                            | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`                                          | React UI for Settings/Auth. Keep it thin: Rust owns capture, summarization, persistence, and delivery.                                                                                                                                                                                                                                                                                                                                                                       |
| `src/auth.ts`                                   | Frontend Auth boundary. Creates the Neon Auth client from `VITE_NEON_AUTH_URL`, validates the env var clearly in development, and does not create a Neon Data API client.                                                                                                                                                                                                                                                                                                    |
| `src-tauri/src/lib.rs`                          | Tauri entry: plugins, command registration, setup, and app lifecycle. Installs the menu bar shell and prevents window close from quitting the service.                                                                                                                                                                                                                                                                                                                       |
| `src-tauri/src/capture_state/`                  | Pure Capture Session shell state machine: unauthenticated, stopped, capturing, error. No Tauri dependencies.                                                                                                                                                                                                                                                                                                                                                                 |
| `src-tauri/src/capture_session/`                | **Deep module** — Capture Session coordinator. Single owner of the shell-state FSM; accepts `CoordinatorCommand` (toggle, sign-in, simulated error), drains `SupervisorEvent`, notifies a single `StateObserver` per transition. Hides FSM mutation, supervisor lifecycle dispatch, and (future) Heartbeat / Session End Marker orchestration behind `submit()` + `subscribe()`.                                                                                             |
| `src-tauri/src/context_heartbeat/`              | **Deep module** — fixed-cadence Context Heartbeat orchestration (`start` / `stop`), activity query boundary, summarization seam, local-write-before-push ordering, delivery marking, and Session End Marker emission.                                                                                                                                                                                                                                                        |
| `src-tauri/src/screenpipe_supervisor/`          | **Deep module** — ScreenPipe child-process lifecycle behind a `Supervisor` trait. Hides resource path spawning, pre-spawn port probe with primary/fallback resolution (ADR-0013), stop/kill handling, one silent crash retry, and `shutdown_intended` flag (ADR-0012) behind `start()` / `stop()`. Publishes `SupervisorEvent` (`Stopped`, `Crashed { user_facing_copy }`) on an mpsc channel; never mutates the FSM directly.                                               |
| `src-tauri/src/port/`                           | Shared pre-spawn TCP port probe with primary/fallback resolution (ADR-0013). Used by `screenpipe_supervisor` and bundled Ollama spawn.                                                                                                                                                                                                                                                                                                                                       |
| `src-tauri/src/menu_bar/`                       | Tauri tray icon, menu descriptors, and command handlers. Publishes `CoordinatorCommand` to the coordinator and registers a `TrayObserver` that re-renders on every state-change notification. State-to-menu/icon mapping stays unit-testable.                                                                                                                                                                                                                                |
| `src-tauri/src/llm_provider/`                   | **Deep module** — `resolve()` at startup (Apple Intelligence → existing Ollama → bundled Ollama); `summarize()` per heartbeat. Hides tier detection, prompts (`prompt.rs`), bundled binary spawn (`bundled.rs`), and the bundled-model `bundled_model_needs_install()` predicate consumed by the onboarding gate.                                                                                                                                                            |
| `src-tauri/src/llm_provider/commands/`          | Tauri commands the Onboarding webview invokes — `start_model_download` drives `LlmProvider::resolve_with_progress` and emits `bundled-ollama:`* progress events.                                                                                                                                                                                                                                                                                                             |
| `src-tauri/src/agent_interface/`                | **Deep module** — emits `context_snapshot` and `session_end_marker` events on the WebSocket Protocol to the Agent Runtime; JWT once at `connect`, no per-event auth; on dropped connection or timeout the local snapshot stays in the Snapshot Store with `pushed_at = null` (ADR-0004, ADR-0011). Imports `ContextSnapshot` from `crate::snapshot`; emits payloads conforming to `packages/protocol/`. The Rust module name is internal — the wire concept is the Protocol. |
| `src-tauri/src/snapshot/`                       | Neutral home for the `ContextSnapshot` domain type. Imported by `agent_interface` and `snapshot_store` so neither depends on the other (ADR-0017).                                                                                                                                                                                                                                                                                                                           |
| `src-tauri/src/snapshot_store/`                 | **Deep module** — sqlx-backed local SQLite log. Public surface: `SnapshotStore::new` (opens, migrates, purges), `insert`, `mark_pushed` (idempotent), `list_recent`. All sqlx complexity (pool, WAL, query strings, `sqlx::Error`) hidden; `SnapshotStoreError` is the boundary (ADR-0007, ADR-0016).                                                                                                                                                                        |
| `src-tauri/migrations/`                         | sqlx-managed schema migrations (`0001_create_snapshots.sql`). Runs on `SnapshotStore::new` via `sqlx::migrate!()`.                                                                                                                                                                                                                                                                                                                                                           |
| `src-tauri/resources/`                          | Bundled native artifacts. v1 ScreenPipe: `@screenpipe/cli-darwin-arm64` only (M-series Macs). Bundled Ollama (`resources/ollama`) ships with the app and is downloaded-on-first-run via the onboarding flow (ADR-0002, ADR-0006, ADR-0014, ADR-0018).                                                                                                                                                                                                                        |
| `src-tauri/icons/tray/`                         | Pre-rendered menu bar icons for idle, capturing, and error states.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `../../docs/CONTEXT.md`                         | Canonical vocabulary at the repo root. Use these names in code and reviews.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `SPEC.md`                                       | Desktop Client v1 requirements and payload contracts.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `DESIGN.md`, `.claude/commands/macos-design.md` | UI brand and native macOS patterns.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `../../docs/adr/`                               | Architectural decisions (unified at repo root); do not contradict silently.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `.github/workflows/ci.yml`                      | PR quality gate: frontend typecheck/build/test; Rust check/clippy/test.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `.github/workflows/release.yml`                 | macOS release on `v`* tags.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |


**Agent skills** — `.claude/skills/screenpipe-`* for operational debugging of the capture engine.

## Architectural Invariants

1. **macOS v1 only** — No cross-platform abstractions in core paths unless required by Tauri deps.
2. **Rust owns orchestration** — Capture, heartbeat, summarization routing, persistence, and Protocol emission live in `src-tauri/`. The webview does not call ScreenPipe, Ollama, or the Agent Runtime directly.
3. **Thin UI boundary** — React talks to Rust only via Tauri commands and events. No business logic duplicated in `src/` that belongs in Rust.
4. **ScreenPipe via HTTP, not SQLite** — Integrate through the bundled CLI and the supervisor's resolved localhost endpoint (`44380` primary, `44382` fallback) for the Intentive-owned process. Do not read ScreenPipe's database unless an API gap is documented and approved (ADR-0002/0013). Embedding `screenpipe-engine` in-process is a targeted future escape hatch, not the default.
5. **Deep modules at integration seams** — `llm_provider`, `agent_interface`, `screenpipe_supervisor`, `capture_session` (coordinator), and `snapshot_store` expose small public surfaces (`resolve`/`summarize`; `emit` + `ContextSnapshot`; `start`/`stop` + `SupervisorEvent`; `submit`/`subscribe` + `CoordinatorCommand`/`StateObserver`; `new`/`insert`/`mark_pushed`/`list_recent`). Callers do not branch on provider tiers, construct Protocol frames, mutate the FSM, read it back to dispatch lifecycle, or see `sqlx::Error` / pool / migration internals.
6. **Context Snapshot contract is frozen for v1** — Payload fields: `id`, `captured_at`, `period_start`, `period_end`, `summary` only. Same shape for the Snapshot Store and the `context_snapshot` Protocol event. Do not add fields without an explicit Protocol contract change in `packages/protocol/`.
7. **Session End Marker contract is its own event** — `session_end_marker` is a distinct Protocol event type, not a flag on `context_snapshot`. Its payload shape is intentionally minimal until the Agent Runtime gateway formalizes it (ADR-0008). Do not smuggle marker fields into `ContextSnapshot`.
8. **Write locally, then emit** — Every snapshot is persisted in the Snapshot Store before the Protocol emit attempt; `pushed_at` records success when a `delivery_ack` returns (ADR-0007). A dropped connection does not delete the local row (ADR-0011).
9. **At-most-once delivery** — No client-side retry queue in v1; reconnect-snapshot semantics in the Protocol handle recovery; heartbeat continues on the next cycle (ADR-0011).
10. **Fixed Context Heartbeat cadence** — During a Capture Session, the Context Heartbeat fires every 10 minutes regardless of activity level. There is no activity-gated skip path (ADR-0008).
11. **Control Plane gates desktop capture** — The Desktop Client does not capture without a signed-in user and Control Plane-confirmed **Desktop Capture Readiness** for that registered Mac. **Capture Permission Setup** is completed on the recording Mac; mobile sign-in or onboarding cannot grant desktop capture consent (ADR-0009, ADR-0015).
12. **Settings is not a developer config panel** — Endpoint URLs, JWTs, ScreenPipe readiness, and capture diagnostics stay out of user-facing Settings. Routing (Agent Runtime URL + JWT) is resolved internally by Control Plane's `GET /agent` after sign-in (ADR-0010).
13. **On-device summarization** — Raw ScreenPipe content is input to the LLM Provider only; only sanitized prose leaves the machine (plus metadata in the snapshot).
14. **Emit, not pull** — Intentive emits `context_snapshot` events on the WebSocket; the Agent Runtime is always-alive and processes events as they arrive (ADR-0004).
15. **Menu bar agent UX** — No Dock icon; no persistent main window (ADR-0003). Settings and first-run/sign-in flows are separate windows.
16. **Product-owned macOS permission identity** — Release builds must present **Intentive** in macOS Privacy Settings, with **Intentive Capture** as the only acceptable helper fallback. `ScreenPipe`, lowercase `intentive`, and debug paths are release blockers (ADR-0015).
17. **ADR supremacy** — If code conflicts with `docs/adr/`, fix code or record a new ADR; do not drift silently.

**Mechanical enforcement today** — At the monorepo root: `pnpm typecheck`, `pnpm lint` (including the architecture lint plugin for the `types → config → repo → service → runtime → ui` rule), `pnpm test`, and `pnpm lint:architecture:test` on every PR. Per-deployable: `cargo check`, `cargo clippy -- -D warnings`, and `cargo test` for the Rust workspace. Module tests use `wiremock` for HTTP boundaries. Rust-side boundaries are enforced by module privacy + ADR review; the TS surfaces (`src/`) participate in the same layer rule the rest of the monorepo follows — see `[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)`.

## Boundaries

### Intentive ↔ ScreenPipe

- **Ownership** — Intentive bundles and spawns the ScreenPipe CLI; ScreenPipe owns capture storage in its SQLite DB.
- **Interface** — Child process lifecycle; REST on `localhost:44380` (primary) or `localhost:44382` (fallback when primary is occupied, per ADR-0013) for Context Heartbeat activity windows. The supervisor's resolved port is the source of truth — consumers must not hard-code `44380`. WebSocket activity signals are not part of the fixed-interval v1 heartbeat contract. Bundled Ollama (Tier 3) runs on `localhost:44381` (primary) or `localhost:44383` (fallback per ADR-0013); existing user Ollama (Tier 2) is read at `localhost:11434`.
- **Rule** — Context Heartbeat reads activity through ScreenPipe's API, not by opening ScreenPipe's DB file.

### Intentive ↔ LLM Provider (on-device)

- **Interface** — Tier 1: ScreenPipe `/ai/status` + `/ai/chat/completions` through the supervisor's resolved ScreenPipe endpoint. Tier 2: existing Ollama at `localhost:11434`. Tier 3: bundled Ollama at `localhost:44381` primary or `localhost:44383` fallback.
- **Selection** — Fixed priority at startup (`LlmProvider::resolve`); user does not pick a model in v1.
- **Privacy** — Prompt constraints in `llm_provider/prompt.rs`; guardrails apply at summarization time, not when storing the summary (ADR-0007).

### Intentive ↔ Agent Runtime

- **Interface** — The Rust `agent_interface` module opens a WebSocket to the Agent Runtime URL issued by Control Plane's `GET /agent`, presents the JWT at the `connect` handshake (with `client_kind: "tauri"`), and emits `context_snapshot` and `session_end_marker` events whose payloads conform to `packages/protocol/`. No per-event auth header.
- **Semantics** — The Agent Runtime is always-alive and multi-tenant; the connection persists across a Capture Session. Connection requires a signed-in user because Routing returns a User-scoped JWT.
- **Failure** — Dropped connection, timeout, or rejected event → the snapshot stays in the Snapshot Store with `pushed_at = null`. Reconnect-snapshot semantics in the Protocol handle recovery; no client-side retry queue in v1 (ADR-0011).
- **Session End Marker** — Emitted as the `session_end_marker` event when a Capture Session ends. It is a distinct event type, not a flag on `context_snapshot`. Final payload shape is deliberately minimal until the Agent Runtime gateway formalizes it.

### Intentive ↔ local data

- **Snapshot log** — Separate Intentive SQLite DB at `BaseDirectory::AppLocalData/intentive.db`, table `snapshots`, 7-day retention purge on launch (ADR-0007). Owned by `snapshot_store`; structurally accepts only `ContextSnapshot` so raw ScreenPipe data has no representation in the API (privacy boundary, see CONTEXT.md "Snapshot Privacy Boundary").
- **Settings** — Account state and rare safe preferences only. Agent endpoint and credential values are internal Auth-resolved configuration, not persisted through frontend-only Settings controls.

### Frontend ↔ Rust (Tauri)

- **Commands** — Toggle capture, open settings, open sign-in/consent surface, read status, first-run progress, persist settings.
- **Events** — State changes (capturing / stopped / error), setup progress, push outcomes for UI if needed.
- **Security** — CSP in `tauri.conf.json` restricts webview network; production paths for localhost services are Rust-side only.

### Auth

- Provider is Neon Auth, built on Better Auth, with Google as the intended v1 OAuth provider.
- `src/auth.ts` owns frontend Auth client setup and `VITE_NEON_AUTH_URL` validation.
- After sign-in, the Desktop Client calls Control Plane's `GET /agent` (Routing) to receive the Agent Runtime URL and a short-lived JWT. Neither value is exposed in Settings.
- Both Control Plane and Agent Runtime verify the JWT locally via Neon Auth JWKS — neither service holds a session table.
- Shared sign-in and Pre-Chat Gate completion may begin on either client; the Control Plane owns cross-client state. Identity Gate and Consent Primer are Cross-Client Gates; Capture Permission Setup is a Device-Local Gate (must happen on this Mac).
- Until Auth, the gate sequence, and Desktop Capture Readiness are all confirmed, the Desktop Client must not start ScreenPipe or a Context Heartbeat.

### CI / release

- **CI** — Ubuntu agents for compile/test; no macOS-specific UI tests in CI.
- **Release** — Tagged `v`* builds macOS app bundle via `release.yml`.
- **Release packaging** — v1 ships as a Developer ID signed and notarized Apple Silicon DMG containing only `Intentive.app`; release smoke is run from `/Applications/Intentive.app`, not `tauri dev` (ADR-0015).

## Cross-cutting Concerns

**Configuration** — LLM endpoints start from `ProviderConfig`, then runtime subprocess owners publish the effective local endpoints: `screenpipe_supervisor` records the active ScreenPipe URL, and bundled Ollama updates its effective URL after port resolution. `VITE_NEON_AUTH_URL` is required by the Settings/Auth surface. `VITE_NEON_DATA_API_URL` is known for the Neon project but intentionally unused until Routing lands. The Agent Runtime URL and JWT are not user-facing Settings config — they come from Control Plane's `GET /agent` and live only in process memory.

**Logging and diagnostics** — Prefer structured Rust logging for heartbeat, provider tier, push results, and ScreenPipe child exit. ScreenPipe operational debugging: `.claude/skills/screenpipe-health`, `screenpipe-logs`, `screenpipe-api`.

**Errors** — Domain errors as `thiserror` enums inside modules (`PushError`, `ProviderError`, state transition errors). UI maps capture/push/provider failures to menu bar **error** state without crashing the heartbeat loop.

**Testing** — Rust: unit tests colocated (`agent_interface/tests`, `llm_provider/tests`, `wiremock` HTTP). Frontend: Vitest + Testing Library smoke tests. No E2E against real ScreenPipe in CI.

**Security posture** — Summaries only cross the network boundary to the Agent Runtime over the WebSocket Protocol; the JWT is presented once at `connect` and is never persisted to disk or surfaced in UI. Webview CSP limits exfiltration from UI code and explicitly allows the Neon Auth origin needed by the Settings/Auth surface.

**Documentation hierarchy** — `ARCHITECTURE.md` (this file) = Desktop-specific structure and invariants; cross-deployable architecture lives at `[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)`; vocabulary at `[docs/CONTEXT.md](../../docs/CONTEXT.md)`; `SPEC.md` = behavior; ADRs at `[docs/adr/](../../docs/adr/)` (repo root); `DESIGN.md` = UI. Agents should read the relevant ADR and `docs/CONTEXT.md` term before changing boundaries.

**Known debt affecting shape** — Neon Auth UI is wired, but Routing (`GET /agent`) is not consumed yet — pending Control Plane implementation. `session_end_marker` payload shape will be confirmed once the Agent Runtime gateway is online. Capture Permission Setup and signed/notarized release packaging are still pending. Intel Mac support and dual-arch packaging are deferred by ADR-0014. Track against `SPEC.md` acceptance checklists.