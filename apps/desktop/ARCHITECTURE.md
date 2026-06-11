# Desktop Client Architecture

For Desktop Client vocabulary, see `[CONTEXT.md](CONTEXT.md)`; for the context map and shared product language, see the root `[CONTEXT-MAP.md](../../CONTEXT-MAP.md)`. For cross-deployable architecture and layer rule, see `[ARCHITECTURE.md](../../ARCHITECTURE.md)`. This file describes Desktop Client-specific structure only.

Contract for v1: the Intentive Desktop Client manages ScreenPipe capture for a signed-in user only after the Control Plane confirms Desktop Capture Readiness for that Mac, runs on-device summarization, persists each **Context Snapshot** in the local **Snapshot Store** before delivery, emits it as a `context_snapshot` event on the shared WebSocket **Protocol** to the **Agent Runtime**, and emits a `session_end_marker` event when a Capture Session ends. Acceptance criteria are in `docs/SPEC.md`; ADRs live at the repo root in `docs/adr/`.

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

**Current implementation state** — The Rust side is organized into layered domains under `src-tauri/src/domains/`: `capture` (`{types,config,service,runtime}`), `routing` (`{types,config,service,runtime}`), `snapshots` (`{types,repo,runtime}`, including the Context Heartbeat and the inert `agent_interface` sink), `summarization` (`{types,config,service,runtime}`), and `menubar` (`{service,ui}`). Cross-cutting helpers (the port probe) live in `src-tauri/src/providers/`. `lib.rs` is the composition root: it constructs the ScreenPipe supervisor and Capture Session coordinator, spawns the coordinator event loop, installs the menu bar shell as a state observer, wires the Snapshot Store (`BaseDirectory::AppLocalData/intentive.db`), starts the Routing-owned Protocol WebSocket session after the webview supplies a login token, and injects the Context Heartbeat into the coordinator's `SessionHooks` lifecycle seam. Heartbeat ticks persist snapshots before delivery attempts; #31 intentionally leaves the sink inert so rows keep `pushed_at = null` until #34 wires `context_snapshot` / `session_end_marker` emission through the live session. `src/` renders a Neon Auth Settings surface and hands the login token to Rust without receiving Routing values.

**Platform** — macOS only, **Apple Silicon (M-series) only** for v1 (ADR-0014). No Windows/Linux, no Intel Macs in v1, no in-app agent reasoning, no client-side retry queue in v1 (delivery is at-most-once with reconnect-snapshot recovery per the Protocol).

## Codemap

| Path                                                           | Role                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`                                                         | React UI composition root (`App.tsx`, `main.tsx`) for Settings/Auth. Exempt from the layer rule; imports from `src/domains/`. Keep it thin: Rust owns capture, summarization, persistence, and delivery.                                                                                                                                                                |
| `src/domains/auth/service/auth.ts`                             | Frontend Auth boundary. Creates the Neon Auth client from `VITE_NEON_AUTH_URL`, validates the env var clearly in development, and does not create a Neon Data API client.                                                                                                                                                                                               |
| `src/domains/onboarding/ui/Onboarding.tsx`                     | Onboarding webview surface: drives `start_model_download` and renders bundled-model download progress.                                                                                                                                                                                                                                                                  |
| `src-tauri/src/lib.rs`                                         | Tauri entry and **composition root** (exempt from the layer rule): plugins, command registration, setup, app lifecycle. Wires the domains together via trait seams (`ScreenpipeUrlSource`, `SessionHooks`, `CaptureSessionControl`), installs the menu bar shell, and prevents window close from quitting the service.                                                  |
| `src-tauri/src/domains/capture/types/state.rs`                 | Pure Capture Session shell state (`CaptureState`: unauthenticated, stopped, capturing, error) + `ErrorReason`. No Tauri dependencies.                                                                                                                                                                                                                                   |
| `src-tauri/src/domains/capture/types/session.rs`               | Coordinator vocabulary: `CoordinatorCommand`, `StateObserver`, plus the cross-domain trait seams `CaptureSessionControl` (menubar→coordinator) and `SessionHooks` (coordinator→heartbeat).                                                                                                                                                                              |
| `src-tauri/src/domains/capture/config/`                        | ScreenPipe supervisor constants (primary/fallback ports, crash copy).                                                                                                                                                                                                                                                                                                   |
| `src-tauri/src/domains/capture/service/`                       | Pure Capture Session FSM (`CaptureStateMachine`) + `AuthChecker` trait. No Tauri dependencies.                                                                                                                                                                                                                                                                          |
| `src-tauri/src/domains/capture/runtime/coordinator/`           | **Deep module** — Capture Session coordinator. Single owner of the shell-state FSM; accepts `CoordinatorCommand`, drains `SupervisorEvent`, notifies a single `StateObserver` per transition. Implements `CaptureSessionControl`; fires `SessionHooks` (heartbeat start/stop) injected at `lib.rs`. Behind `submit()` + `subscribe()`.                                  |
| `src-tauri/src/domains/capture/runtime/screenpipe_supervisor/` | **Deep module** — ScreenPipe child-process lifecycle behind a `Supervisor` trait. Hides resource-path spawning, pre-spawn port probe (ADR-0013), stop/kill, one silent crash retry, and `shutdown_intended` (ADR-0012) behind `start()` / `stop()`. Publishes `SupervisorEvent` on an mpsc channel; never mutates the FSM.                                              |
| `src-tauri/src/providers/port/`                                | Cross-cutting pre-spawn TCP port probe with primary/fallback resolution (ADR-0013). Used by the ScreenPipe supervisor and bundled Ollama spawn. Lives in `providers/` (binary-local analog of `packages/providers/`).                                                                                                                                                   |
| `src-tauri/src/domains/menubar/ui/`                            | Tauri tray icon install and command handlers. Publishes `CoordinatorCommand` via the `CaptureSessionControl` seam and registers a `TrayObserver` that re-renders on every state-change notification.                                                                                                                                                                    |
| `src-tauri/src/domains/menubar/service/`                       | Pure, Tauri-free `CaptureState` → menu descriptor (`menu.rs`) and tray-icon path (`icon.rs`) mapping. Unit-tested in isolation.                                                                                                                                                                                                                                         |
| `src-tauri/src/domains/summarization/service/`                 | **Deep module** — `LlmProvider::resolve()` at startup (Apple Intelligence → existing Ollama → bundled Ollama); `summarize()` per heartbeat. Hides tier detection, prompts (`prompt.rs`), bundled binary spawn (`bundled.rs`), and `bundled_model_needs_install()`. `ProviderConfig` lives in `summarization/config/`; `Tier`/`ProviderError` in `summarization/types/`. |
| `src-tauri/src/domains/summarization/runtime/commands/`        | Tauri commands the Onboarding webview invokes — `start_model_download` drives `LlmProvider::resolve_with_progress` and emits `bundled-ollama:`\* progress events.                                                                                                                                                                                                       |
| `src-tauri/src/domains/routing/types/`                         | Rust-owned Routing and connection vocabulary: `Routing`, `RoutingState`, `SessionState`, runtime handshake frame subset, and the plain `ConnectionMood` emitted to Settings. No Tauri or I/O.                                                                                                                                                                           |
| `src-tauri/src/domains/routing/config/`                        | Routing constants: Control Plane base URL env name, fixture Routing env name, `GET /agent` path, `client_kind: "desktop"`, client version, and reconnect backoff bounds.                                                                                                                                                                                                |
| `src-tauri/src/domains/routing/service/`                       | Pure Routing/Session state transitions, runtime-error reconnect decisions, and exponential backoff. No I/O.                                                                                                                                                                                                                                                             |
| `src-tauri/src/domains/routing/runtime/`                       | **Deep module** — hides `GET /agent`, fixture Routing, WebSocket `connect` handshake, runtime-error handling, backoff+jitter reconnect, login-token commands, and Settings status events behind `WsSession::set_login_token` / `clear_login_token` plus small trait seams. Snapshot event emission remains #34.                                                         |
| `src-tauri/src/domains/snapshots/runtime/heartbeat/`           | **Deep module** — fixed-cadence Context Heartbeat orchestration (`start` / `stop`), activity query boundary, summarization seam, local-write-before-push ordering, delivery marking, and Session End Marker emission. Reads the live ScreenPipe URL through the `ScreenpipeUrlSource` seam.                                                                             |
| `src-tauri/src/domains/snapshots/runtime/agent_interface/`     | Heartbeat `AgentSink` seam. For #31 it is an inert no-op sink that reports "not connected" so local rows keep `pushed_at = null`; #34 wires this seam to the live Routing-owned Protocol session.                                                                                                                                                                       |
| `src-tauri/src/domains/snapshots/types/`                       | Neutral home for the `ContextSnapshot` domain type (+ `SessionEndMarker`, `SessionEndReason`). Imported by `agent_interface` and the Snapshot Store repo so neither depends on the other (ADR-0017).                                                                                                                                                                    |
| `src-tauri/src/domains/snapshots/repo/`                        | **Deep module** — sqlx-backed local SQLite log. Public surface: `SnapshotStore::new` (opens, migrates, purges), `insert`, `mark_pushed` (idempotent), `list_recent`. All sqlx complexity hidden; `SnapshotStoreError` is the boundary (ADR-0007, ADR-0016).                                                                                                             |
| `src-tauri/migrations/`                                        | sqlx-managed schema migrations (`0001_create_snapshots.sql`). Runs on `SnapshotStore::new` via `sqlx::migrate!()`.                                                                                                                                                                                                                                                      |
| `src-tauri/resources/`                                         | Bundled native artifacts. v1 ScreenPipe: `@screenpipe/cli-darwin-arm64` only (M-series Macs). Bundled Ollama (`resources/ollama`) ships with the app and is downloaded-on-first-run via the onboarding flow (ADR-0002, ADR-0006, ADR-0014, ADR-0018).                                                                                                                   |
| `src-tauri/icons/tray/`                                        | Pre-rendered menu bar icons for idle, capturing, and error states.                                                                                                                                                                                                                                                                                                      |
| `CONTEXT.md`                                                   | Desktop Client vocabulary. Use these names in code and reviews.                                                                                                                                                                                                                                                                                                         |
| `docs/SPEC.md`                                                 | Desktop Client v1 requirements and payload contracts.                                                                                                                                                                                                                                                                                                                   |
| `docs/DESIGN.md`, `references/`                                | Native macOS UI patterns and companion references.                                                                                                                                                                                                                                                                                                                      |
| `../../docs/adr/`                                              | Architectural decisions (unified at repo root); do not contradict silently.                                                                                                                                                                                                                                                                                             |
| `.github/workflows/desktop-ci.yml`                             | PR quality gate: frontend typecheck/build/test; Rust check/clippy/test.                                                                                                                                                                                                                                                                                                 |
| `.github/workflows/desktop-release.yml`                        | macOS release on `v`\* tags.                                                                                                                                                                                                                                                                                                                                            |

## Architectural Invariants

1. **macOS v1 only** — No cross-platform abstractions in core paths unless required by Tauri deps.
2. **Rust owns orchestration** — Capture, heartbeat, summarization, Routing, persistence, and Protocol emission live in `src-tauri/`. The webview does not call ScreenPipe, Ollama, Control Plane, or the Agent Runtime directly.
3. **Thin UI boundary** — React talks to Rust only via Tauri commands and events. No business logic duplicated in `src/` that belongs in Rust.
4. **ScreenPipe via HTTP, not SQLite** — Integrate through the bundled CLI and the supervisor's resolved localhost endpoint (`44380` primary, `44382` fallback) for the Intentive-owned process. Do not read ScreenPipe's database unless an API gap is documented and approved (ADR-0002/0013). Embedding `screenpipe-engine` in-process is a targeted future escape hatch, not the default.
5. **Deep modules at integration seams** — `summarization::service` (LlmProvider), `routing::runtime` (WsSession), `capture::runtime::screenpipe_supervisor`, `capture::runtime::coordinator`, and `snapshots::repo` (SnapshotStore) expose small public surfaces (`resolve`/`summarize`; `set_login_token`/`clear_login_token` + Routing/Session state; `start`/`stop` + `SupervisorEvent`; `submit`/`subscribe` + `CoordinatorCommand`/`StateObserver`; `new`/`insert`/`mark_pushed`/`list_recent`). The heartbeat's `agent_interface` sink stays a narrow seam until #34. Callers do not branch on provider tiers, construct Protocol frames, mutate the FSM, read it back to dispatch lifecycle, or see `sqlx::Error` / pool / migration internals.
6. **Context Snapshot contract is frozen for v1** — Payload fields: `id`, `captured_at`, `period_start`, `period_end`, `summary` only. Same shape for the Snapshot Store and the `context_snapshot` Protocol event. Do not add fields without an explicit Protocol contract change in `packages/protocol/`.
7. **Session End Marker contract is its own event** — `session_end_marker` is a distinct Protocol event type, not a flag on `context_snapshot`. Canonical fields are `ended_at` and `reason` in `packages/protocol/`. Do not smuggle marker fields into `ContextSnapshot`.
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

**Mechanical enforcement today** — At the monorepo root, the PR gate runs `pnpm harness:ci` / `pnpm harness`, including `pnpm typecheck`, `pnpm lint` (architecture lint for the `types → config → repo → service → runtime → ui` rule), `pnpm test`, `pnpm lint:architecture:test`, and `pnpm lint:architecture:rust`. The Rust side is enforced by the custom checker in `tools/linters/rust-architecture/` (ESLint never parses `.rs`): it shares the TS `LAYER_ORDER`, enforces layer direction within a domain, allows only `types`-layer references across domains (with `providers/` as cross-cutting and `lib.rs`/`main.rs` exempt), and asserts the structural rule that only `lib.rs`, `main.rs`, `domains/`, and `providers/` live directly under `src-tauri/src/`. Cross-domain couplings are expressed via trait seams injected at `lib.rs`, not direct imports. Per-deployable: `cargo check`, `cargo clippy -- -D warnings`, and `cargo test`. Module tests use `wiremock` for HTTP boundaries. The TS surfaces (`src/domains/`) participate in the same layer rule the rest of the monorepo follows — see `[ARCHITECTURE.md](../../ARCHITECTURE.md)`.

## Boundaries

### Intentive ↔ ScreenPipe

- **Ownership** — Intentive bundles and spawns the ScreenPipe CLI; ScreenPipe owns capture storage in its SQLite DB.
- **Interface** — Child process lifecycle; REST on `localhost:44380` (primary) or `localhost:44382` (fallback when primary is occupied, per ADR-0013) for Context Heartbeat activity windows. The supervisor's resolved port is the source of truth — consumers must not hard-code `44380`. WebSocket activity signals are not part of the fixed-interval v1 heartbeat contract. Bundled Ollama (Tier 3) runs on `localhost:44381` (primary) or `localhost:44383` (fallback per ADR-0013); existing user Ollama (Tier 2) is read at `localhost:11434`.
- **Rule** — Context Heartbeat reads activity through ScreenPipe's API, not by opening ScreenPipe's DB file.

### Intentive ↔ LLM Provider (on-device)

- **Interface** — Tier 1: ScreenPipe `/ai/status` + `/ai/chat/completions` through the supervisor's resolved ScreenPipe endpoint. Tier 2: existing Ollama at `localhost:11434`. Tier 3: bundled Ollama at `localhost:44381` primary or `localhost:44383` fallback.
- **Selection** — Fixed priority at startup (`LlmProvider::resolve`); user does not pick a model in v1.
- **Privacy** — Prompt constraints in `domains/summarization/service/prompt.rs`; guardrails apply at summarization time, not when storing the summary (ADR-0007).

### Intentive ↔ Agent Runtime

- **Interface** — The Rust `routing` domain fetches Routing from Control Plane's `GET /agent`, opens a WebSocket to the returned Agent Runtime URL, and presents the JWT at the `connect` handshake (with `client_kind: "desktop"`, per the `ClientKind` enum in `packages/protocol/`). #31 owns the session skeleton only; #34 emits `context_snapshot` and `session_end_marker` events through that live session. No per-event auth header.
- **Semantics** — The Agent Runtime is always-alive and multi-tenant; the connection persists across a Capture Session. Connection requires a signed-in user because Routing returns a User-scoped JWT.
- **Failure** — Dropped connection, timeout, or rejected event → the snapshot stays in the Snapshot Store with `pushed_at = null`. Reconnect-snapshot semantics in the Protocol handle recovery; no client-side retry queue in v1 (ADR-0011).
- **Session End Marker** — Emitted as the `session_end_marker` event when a Capture Session ends. It is a distinct event type, not a flag on `context_snapshot`, and uses canonical `ended_at` + `reason` fields from `packages/protocol/`.

### Intentive ↔ local data

- **Snapshot log** — Separate Intentive SQLite DB at `BaseDirectory::AppLocalData/intentive.db`, table `snapshots`, 7-day retention purge on launch (ADR-0007). Owned by `snapshot_store`; structurally accepts only `ContextSnapshot` so raw ScreenPipe data has no representation in the API (privacy boundary, see CONTEXT.md "Snapshot Privacy Boundary").
- **Settings** — Account state and rare safe preferences only. Agent endpoint and credential values are internal Auth-resolved configuration, not persisted through frontend-only Settings controls.

### Frontend ↔ Rust (Tauri)

- **Commands** — Toggle capture, open settings, open sign-in/consent surface, read status, first-run progress, persist settings, `set_login_token` / `clear_login_token` / `get_connection_status` (Auth → Routing handoff and mood replay).
- **Events** — Capture state changes (capturing / stopped / error), setup progress, `routing:status` connection mood for Settings (no Routing values or JWT).
- **Security** — CSP in `tauri.conf.json` restricts webview network; production paths for localhost services are Rust-side only.

### Auth

- Provider is Neon Auth, built on Better Auth, with Google as the intended v1 OAuth provider.
- `src/domains/auth/service/auth.ts` owns frontend Auth client setup and `VITE_NEON_AUTH_URL` validation.
- After sign-in, the Desktop Client calls Control Plane's `GET /agent` (Routing) to receive the Agent Runtime URL and a short-lived JWT. Neither value is exposed in Settings.
- Both Control Plane and Agent Runtime verify the JWT locally via Neon Auth JWKS — neither service holds a session table.
- Shared sign-in and Pre-Chat Gate completion may begin on either client; the Control Plane owns cross-client state. Identity Gate and Consent Primer are Cross-Client Gates; Capture Permission Setup is a Device-Local Gate (must happen on this Mac).
- Until Auth, the gate sequence, and Desktop Capture Readiness are all confirmed, the Desktop Client must not start ScreenPipe or a Context Heartbeat.

### CI / release

- **CI** — Ubuntu agents for compile/test; no macOS-specific UI tests in CI.
- **Release** — Tagged `v`\* builds macOS app bundle via `release.yml`.
- **Release packaging** — v1 ships as a Developer ID signed and notarized Apple Silicon DMG containing only `Intentive.app`; release smoke is run from `/Applications/Intentive.app`, not `tauri dev` (ADR-0015).

## Cross-cutting Concerns

**Configuration** — LLM endpoints start from `ProviderConfig`, then runtime subprocess owners publish the effective local endpoints: `screenpipe_supervisor` records the active ScreenPipe URL, and bundled Ollama updates its effective URL after port resolution. `VITE_NEON_AUTH_URL` is required by the Settings/Auth surface. `INTENTIVE_CONTROL_PLANE_URL` points Rust at Control Plane for `GET /agent`; `INTENTIVE_DESKTOP_ROUTING_FIXTURE` can inject a dev/smoke Routing JSON object before a live Control Plane is available (valid fixture wins when both are set; malformed fixture logs and falls back to Control Plane). The Agent Runtime URL and JWT are not user-facing Settings config — they come from Control Plane's `GET /agent` and live only in process memory.

**Logging and diagnostics** — Prefer structured Rust logging for heartbeat, provider tier, push results, and ScreenPipe child exit.

**Errors** — Domain errors as `thiserror` enums inside modules (`PushError`, `ProviderError`, state transition errors). UI maps capture/push/provider failures to menu bar **error** state without crashing the heartbeat loop.

**Testing** — Rust: unit tests colocated (`domains/routing/service`, `domains/routing/runtime`, `domains/snapshots/runtime/agent_interface/tests`, `domains/summarization/service/tests`, `wiremock` HTTP). Frontend: Vitest + Testing Library smoke tests. No E2E against real ScreenPipe in CI.

**Security posture** — Summaries only cross the network boundary to the Agent Runtime over the WebSocket Protocol; the JWT is presented once at `connect` and is never persisted to disk or surfaced in UI. Webview CSP limits exfiltration from UI code and explicitly allows the Neon Auth origin needed by the Settings/Auth surface.

**Documentation hierarchy** — `ARCHITECTURE.md` (this file) = Desktop-specific structure and invariants; cross-deployable architecture lives at `[ARCHITECTURE.md](../../ARCHITECTURE.md)`; vocabulary at `[CONTEXT.md](CONTEXT.md)` (Desktop Client) and the root `[CONTEXT-MAP.md](../../CONTEXT-MAP.md)`; `docs/SPEC.md` = behavior; Desktop ADRs at `[docs/adr/](docs/adr/)` (system-wide at `[../../docs/adr/](../../docs/adr/)`); `docs/DESIGN.md` = UI. Agents should read the relevant ADR and the `CONTEXT.md` term before changing boundaries.

**Known debt affecting shape** — Routing and the Protocol WebSocket session skeleton are wired, but snapshot/session-end emission through that live session remains #34. Capture Permission Setup and signed/notarized release packaging are still pending. Intel Mac support and dual-arch packaging are deferred by ADR-0014. Track against `docs/SPEC.md` acceptance checklists.
