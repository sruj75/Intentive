# Architecture

Contract for v1: the Intentive Desktop Client manages ScreenPipe capture for a signed-in user only after the shared Control Plane confirms Desktop Capture Readiness for that Mac, runs on-device summarization, logs Context Snapshots locally, pushes them to the OpenClaw Agent, and sends a Session End Marker when a Capture Session ends. Domain terms live in `CONTEXT.md`; acceptance criteria in `SPEC.md`; decisions in `docs/adr/`.

## Bird's-eye Overview

Intentive sits between four external systems and one user:

```
┌─────────────┐     HTTP/WS        ┌──────────────┐
│  ScreenPipe │◄──────────────--──►│              │
│  (child)    │  :44380 or :44382  │   Intentive  │
└─────────────┘                    │  (Tauri/Rust)│
                                   │              │
┌─────────────┐     HTTP           │  ┌────────┐  │     HTTPS POST
│ Ollama /    │◄───────────────────┼──│ Heart- │──┼────────────────► OpenClaw Agent
│ Apple Intel │  :11434(existing)  │  │ beat   │  │   (GCP webhook)
│             │  :44381/44383      │  │        │  │
└─────────────┘   (via ScreenPipe) │  └────────┘  │
                                   │      │       │
                                   │  SQLite log  │
                                   └──────┬───────┘
                                          │ Tauri invoke / events
                                   ┌──────▼────────-─┐
                                   │ Menu bar +      │
                                   │ settings (React)│◄── Neon Auth
                                   └───────────────-─┘
```

**Capture Session** — Capture starts automatically when a signed-in user launches the Desktop Client and the Control Plane confirms **Desktop Capture Readiness** for that registered Mac. The Desktop Client spawns ScreenPipe and runs the **Context Heartbeat** on a fixed 10-minute cadence. Each cycle: query ScreenPipe for the preceding activity window → summarize via **LLM Provider** → write **Context Snapshot** to local SQLite → **push** via **Agent Interface**. Stop, quit, or ScreenPipe crash ends the Capture Session and sends a **Session End Marker** before teardown. Mobile onboarding never authorizes Mac screen capture.

**Current implementation state** — The repo is past starter scaffold for Rust domains (`capture_session`, `capture_state`, `context_heartbeat`, `screenpipe_supervisor`, `menu_bar`, `llm_provider`, `agent_interface`, `snapshot`, `snapshot_store`). `lib.rs` constructs the ScreenPipe supervisor and Capture Session coordinator, spawns the coordinator event loop, installs the menu bar shell as a state observer, wires the Snapshot Store (`BaseDirectory::AppLocalData/intentive.db`), and installs Context Heartbeat into coordinator lifecycle hooks. Heartbeat ticks persist snapshots before delivery attempts and stamp `pushed_at` only on successful delivery. Session End Marker transport is wired at the call site with a currently stubbed Agent Interface receiver pending the agent-side contract. `src/` renders a Neon Auth Settings surface; fully Auth-resolved Agent Interface endpoint/credential configuration remains planned.

**Platform** — macOS only, **Apple Silicon (M-series) only** for v1 (ADR-0014). No Windows/Linux, no Intel Macs in v1, no in-app agent reasoning, no push retry queue (ADR-0005).

## Codemap


| Path                                            | Role                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/`                                          | React UI for Settings/Auth. Keep it thin: Rust owns capture, summarization, persistence, and delivery.                                                                                                                                                                                                                                                                                                                         |
| `src/auth.ts`                                   | Frontend Auth boundary. Creates the Neon Auth client from `VITE_NEON_AUTH_URL`, validates the env var clearly in development, and does not create a Neon Data API client.                                                                                                                                                                                                                                                      |
| `src-tauri/src/lib.rs`                          | Tauri entry: plugins, command registration, setup, and app lifecycle. Installs the menu bar shell and prevents window close from quitting the service.                                                                                                                                                                                                                                                                         |
| `src-tauri/src/capture_state/`                  | Pure Capture Session shell state machine: unauthenticated, stopped, capturing, error. No Tauri dependencies.                                                                                                                                                                                                                                                                                                                   |
| `src-tauri/src/capture_session/`                | **Deep module** — Capture Session coordinator. Single owner of the shell-state FSM; accepts `CoordinatorCommand` (toggle, sign-in, simulated error), drains `SupervisorEvent`, notifies a single `StateObserver` per transition. Hides FSM mutation, supervisor lifecycle dispatch, and (future) Heartbeat / Session End Marker orchestration behind `submit()` + `subscribe()`.                                               |
| `src-tauri/src/context_heartbeat/`              | **Deep module** — fixed-cadence Context Heartbeat orchestration (`start` / `stop`), activity query boundary, summarization seam, local-write-before-push ordering, delivery marking, and Session End Marker emission.                                                                                                                                                |
| `src-tauri/src/screenpipe_supervisor/`          | **Deep module** — ScreenPipe child-process lifecycle behind a `Supervisor` trait. Hides resource path spawning, pre-spawn port probe with primary/fallback resolution (ADR-0013), stop/kill handling, one silent crash retry, and `shutdown_intended` flag (ADR-0012) behind `start()` / `stop()`. Publishes `SupervisorEvent` (`Stopped`, `Crashed { user_facing_copy }`) on an mpsc channel; never mutates the FSM directly. |
| `src-tauri/src/port/`                           | Shared pre-spawn TCP port probe with primary/fallback resolution (ADR-0013). Used by `screenpipe_supervisor` and bundled Ollama spawn.                                                                                                                                                                                                                                                                                         |
| `src-tauri/src/menu_bar/`                       | Tauri tray icon, menu descriptors, and command handlers. Publishes `CoordinatorCommand` to the coordinator and registers a `TrayObserver` that re-renders on every state-change notification. State-to-menu/icon mapping stays unit-testable.                                                                                                                                                                                  |
| `src-tauri/src/llm_provider/`                   | **Deep module** — `resolve()` at startup (Apple Intelligence → existing Ollama → bundled Ollama); `summarize()` per heartbeat. Hides tier detection, prompts (`prompt.rs`), bundled binary spawn (`bundled.rs`), and the bundled-model `bundled_model_needs_install()` predicate consumed by the onboarding gate.                                                                                                              |
| `src-tauri/src/llm_provider/commands/`          | Tauri commands the Onboarding webview invokes — `start_model_download` drives `LlmProvider::resolve_with_progress` and emits `bundled-ollama:`* progress events.                                                                                                                                                                                                                                                               |
| `src-tauri/src/agent_interface/`                | **Deep module** — `AgentInterface::push()` HTTPS POST with Bearer auth, 10s timeout, drop-on-failure (ADR-0004, ADR-0005). Imports `ContextSnapshot` from `crate::snapshot`.                                                                                                                                                                                                                                                   |
| `src-tauri/src/snapshot/`                       | Neutral home for the `ContextSnapshot` domain type. Imported by `agent_interface` and `snapshot_store` so neither depends on the other (ADR-0017).                                                                                                                                                                                                                                                                             |
| `src-tauri/src/snapshot_store/`                 | **Deep module** — sqlx-backed local SQLite log. Public surface: `SnapshotStore::new` (opens, migrates, purges), `insert`, `mark_pushed` (idempotent), `list_recent`. All sqlx complexity (pool, WAL, query strings, `sqlx::Error`) hidden; `SnapshotStoreError` is the boundary (ADR-0007, ADR-0016).                                                                                                                          |
| `src-tauri/migrations/`                         | sqlx-managed schema migrations (`0001_create_snapshots.sql`). Runs on `SnapshotStore::new` via `sqlx::migrate!()`.                                                                                                                                                                                                                                                                                                             |
| `src-tauri/resources/`                          | Bundled native artifacts. v1 ScreenPipe: `@screenpipe/cli-darwin-arm64` only (M-series Macs). Bundled Ollama (`resources/ollama`) ships with the app and is downloaded-on-first-run via the onboarding flow (ADR-0002, ADR-0006, ADR-0014, ADR-0018).                                                                                                                                                                          |
| `src-tauri/icons/tray/`                         | Pre-rendered menu bar icons for idle, capturing, and error states.                                                                                                                                                                                                                                                                                                                                                             |
| `CONTEXT.md`                                    | Glossary — use these names in code and reviews.                                                                                                                                                                                                                                                                                                                                                                                |
| `SPEC.md`                                       | v1 requirements and payload contracts.                                                                                                                                                                                                                                                                                                                                                                                         |
| `DESIGN.md`, `.claude/commands/macos-design.md` | UI brand and native macOS patterns.                                                                                                                                                                                                                                                                                                                                                                                            |
| `docs/adr/`                                     | Architectural decisions; do not contradict silently.                                                                                                                                                                                                                                                                                                                                                                           |
| `.github/workflows/ci.yml`                      | PR quality gate: frontend typecheck/build/test; Rust check/clippy/test.                                                                                                                                                                                                                                                                                                                                                        |
| `.github/workflows/release.yml`                 | macOS release on `v`* tags.                                                                                                                                                                                                                                                                                                                                                                                                    |


**Agent skills** — `.claude/skills/screenpipe-`* for operational debugging of the capture engine.

## Architectural Invariants

1. **macOS v1 only** — No cross-platform abstractions in core paths unless required by Tauri deps.
2. **Rust owns orchestration** — Capture, heartbeat, summarization routing, persistence, and delivery live in `src-tauri/`. The webview does not call ScreenPipe, Ollama, or the OpenClaw Agent directly.
3. **Thin UI boundary** — React talks to Rust only via Tauri commands and events. No business logic duplicated in `src/` that belongs in Rust.
4. **ScreenPipe via HTTP, not SQLite** — Integrate through the bundled CLI and the supervisor's resolved localhost endpoint (`44380` primary, `44382` fallback) for the Intentive-owned process. Do not read ScreenPipe's database unless an API gap is documented and approved (ADR-0002/0013). Embedding `screenpipe-engine` in-process is a targeted future escape hatch, not the default.
5. **Deep modules at integration seams** — `llm_provider`, `agent_interface`, `screenpipe_supervisor`, `capture_session` (coordinator), and `snapshot_store` expose small public surfaces (`resolve`/`summarize`; `push` + `ContextSnapshot`; `start`/`stop` + `SupervisorEvent`; `submit`/`subscribe` + `CoordinatorCommand`/`StateObserver`; `new`/`insert`/`mark_pushed`/`list_recent`). Callers do not branch on provider tiers, construct HTTP details, mutate the FSM, read it back to dispatch lifecycle, or see `sqlx::Error` / pool / migration internals.
6. **Context Snapshot contract is frozen for v1** — Payload fields: `id`, `captured_at`, `period_start`, `period_end`, `summary` only. Same shape for local SQLite and HTTPS push. Do not add fields without an explicit contract change.
7. **Session End Marker contract is deferred** — It must be emitted when a Capture Session ends, but its payload shape and OpenClaw Agent handling are intentionally undefined until the agent-side contract exists (ADR-0008). Do not smuggle marker fields into `ContextSnapshot`.
8. **Write locally, then push** — Every snapshot is persisted before delivery attempt; `pushed_at` records success (ADR-0007). Push failure does not delete the local row (ADR-0005).
9. **Drop failed pushes** — No retry queue in v1; heartbeat continues on the next cycle (ADR-0005).
10. **Fixed Context Heartbeat cadence** — During a Capture Session, the Context Heartbeat fires every 10 minutes regardless of activity level. There is no activity-gated skip path (ADR-0008).
11. **Control Plane gates desktop capture** — The Desktop Client does not capture without a signed-in user and Control Plane-confirmed **Desktop Capture Readiness** for that registered Mac. **Capture Permission Setup** is completed on the recording Mac; mobile sign-in or onboarding cannot grant desktop capture consent (ADR-0009, ADR-0015).
12. **Settings is not a developer config panel** — Endpoint URLs, API keys, ScreenPipe readiness, and capture diagnostics stay out of user-facing Settings. The signed-in Neon user resolves Agent Interface configuration behind Auth (ADR-0010).
13. **On-device summarization** — Raw ScreenPipe content is input to the LLM Provider only; only sanitized prose leaves the machine (plus metadata in the snapshot).
14. **Push, not pull** — Intentive POSTs to the OpenClaw Agent; the agent does not poll the Mac (ADR-0004).
15. **Menu bar agent UX** — No Dock icon; no persistent main window (ADR-0003). Settings and first-run/sign-in flows are separate windows.
16. **Product-owned macOS permission identity** — Release builds must present **Intentive** in macOS Privacy Settings, with **Intentive Capture** as the only acceptable helper fallback. `ScreenPipe`, lowercase `intentive`, and debug paths are release blockers (ADR-0015).
17. **ADR supremacy** — If code conflicts with `docs/adr/`, fix code or record a new ADR; do not drift silently.

**Mechanical enforcement today** — CI runs `npx tsc --noEmit`, `npm run build`, `npm test`, `cargo check`, `cargo clippy -- -D warnings`, and `cargo test` on every PR. Module tests use `wiremock` for HTTP boundaries. This repo does not use the harness `Types → Config → Repo → Service → Runtime → UI` layer stack; boundaries are enforced by module privacy, ADR review, and the gates above.

## Boundaries

### Intentive ↔ ScreenPipe

- **Ownership** — Intentive bundles and spawns the ScreenPipe CLI; ScreenPipe owns capture storage in its SQLite DB.
- **Interface** — Child process lifecycle; REST on `localhost:44380` (primary) or `localhost:44382` (fallback when primary is occupied, per ADR-0013) for Context Heartbeat activity windows. The supervisor's resolved port is the source of truth — consumers must not hard-code `44380`. WebSocket activity signals are not part of the fixed-interval v1 heartbeat contract. Bundled Ollama (Tier 3) runs on `localhost:44381` (primary) or `localhost:44383` (fallback per ADR-0013); existing user Ollama (Tier 2) is read at `localhost:11434`.
- **Rule** — Context Heartbeat reads activity through ScreenPipe's API, not by opening ScreenPipe's DB file.

### Intentive ↔ LLM Provider (on-device)

- **Interface** — Tier 1: ScreenPipe `/ai/status` + `/ai/chat/completions` through the supervisor's resolved ScreenPipe endpoint. Tier 2: existing Ollama at `localhost:11434`. Tier 3: bundled Ollama at `localhost:44381` primary or `localhost:44383` fallback.
- **Selection** — Fixed priority at startup (`LlmProvider::resolve`); user does not pick a model in v1.
- **Privacy** — Prompt constraints in `llm_provider/prompt.rs`; guardrails apply at summarization time, not when storing the summary (ADR-0007).

### Intentive ↔ OpenClaw Agent

- **Interface** — `AgentInterface::push` — HTTPS POST to the Auth-resolved webhook URL, `Authorization: Bearer <api_key>`, 10s timeout.
- **Semantics** — Agent is a black box; event-driven on receipt. Delivery requires Auth because Capture Sessions require a signed-in user.
- **Failure** — Non-2xx, timeout, or network error → delivery dropped; local row kept with `pushed_at` null.
- **Session End Marker** — Sent through the Agent Interface when a Capture Session ends. Payload shape is deliberately deferred until the OpenClaw Agent contract is defined.

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
- Auth links the user's Intentive installation to an OpenClaw Agent endpoint and API key without exposing those values in Settings.
- Neon Data API reads for endpoint/credential resolution are deferred to the Auth-resolved config slice; `src/auth.ts` must not become the Data API client.
- Shared sign-in and onboarding may begin in either client; the Control Plane owns that cross-client state.
- Desktop capture consent is collected through Capture Permission Setup on the recording Mac and becomes Control Plane-confirmed Desktop Capture Readiness for that device.
- Until Auth and Desktop Capture Readiness are confirmed, the Desktop Client must not start ScreenPipe or a Context Heartbeat.

### CI / release

- **CI** — Ubuntu agents for compile/test; no macOS-specific UI tests in CI.
- **Release** — Tagged `v`* builds macOS app bundle via `release.yml`.
- **Release packaging** — v1 ships as a Developer ID signed and notarized Apple Silicon DMG containing only `Intentive.app`; release smoke is run from `/Applications/Intentive.app`, not `tauri dev` (ADR-0015).

## Cross-cutting Concerns

**Configuration** — LLM endpoints start from `ProviderConfig`, then runtime subprocess owners publish the effective local endpoints: `screenpipe_supervisor` records the active ScreenPipe URL, and bundled Ollama updates its effective URL after port resolution. `VITE_NEON_AUTH_URL` is required by the Settings/Auth surface. `VITE_NEON_DATA_API_URL` is known for the Neon project but intentionally unused until Auth-resolved Agent Interface configuration lands. Agent endpoint and API key values are not user-facing Settings config.

**Logging and diagnostics** — Prefer structured Rust logging for heartbeat, provider tier, push results, and ScreenPipe child exit. ScreenPipe operational debugging: `.claude/skills/screenpipe-health`, `screenpipe-logs`, `screenpipe-api`.

**Errors** — Domain errors as `thiserror` enums inside modules (`PushError`, `ProviderError`, state transition errors). UI maps capture/push/provider failures to menu bar **error** state without crashing the heartbeat loop.

**Testing** — Rust: unit tests colocated (`agent_interface/tests`, `llm_provider/tests`, `wiremock` HTTP). Frontend: Vitest + Testing Library smoke tests. No E2E against real ScreenPipe in CI.

**Security posture** — Summaries only cross the network boundary to OpenClaw; API key in `Authorization` header only (SPEC resolved questions). Webview CSP limits exfiltration from UI code and explicitly allows the Neon Auth origin needed by the Settings/Auth surface.

**Documentation hierarchy** — `ARCHITECTURE.md` (this file) = structure and invariants; `CONTEXT.md` = language; `SPEC.md` = behavior; `docs/adr/` = decisions; `DESIGN.md` = UI. Agents should read ADRs before changing boundaries.

**Known debt affecting shape** — Neon Auth UI is wired, but Auth-resolved Agent Interface endpoint/credential configuration is not. Session End Marker receiver payload/transport is still deferred on the agent-side contract, though the heartbeat lifecycle call site is wired. Capture Permission Setup and signed/notarized release packaging are still pending. Intel Mac support and dual-arch packaging are deferred by ADR-0014. Track against `SPEC.md` acceptance checklists.
