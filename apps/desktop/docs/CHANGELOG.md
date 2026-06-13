# Changelog

All notable changes to Intentive. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Changed

- **Session End Marker now emits before ScreenPipe shutdown (#35, ADR-0022)** —
  On a capture Stop, the coordinator's `Effect::StopSession` now stops the
  Context Heartbeat (which drains a final snapshot and emits the
  `session_end_marker`) **before** stopping the ScreenPipe Supervisor, reversing
  the prior order. The marker needs neither ScreenPipe alive nor a fresh tick and
  rides the independent Routing `WsSession`, so it provably leaves the process
  before ScreenPipe exits. Pinned by a coordinator ordering test and asserted
  end-to-end by the #35 smoke. No wire-format change.

### Added

- **Signed-in Capture Session smoke (#35)** — A demoable, AFK-runnable harness
  (`apps/desktop/smoke/`, the `@intentive/desktop-smoke` workspace package) that
  proves the full assembled chain on a signed-in Mac: routing from a Control
  Plane stub (real `createJwtVerifier` JWT verification) → real ScreenPipe
  capture → Context Heartbeat → Snapshot Store (written before delivery) →
  `context_snapshot` Protocol event to a recording gateway (real
  `@intentive/protocol` parser) → `session_end_marker` before ScreenPipe
  shutdown. Dev-only, `#[cfg(debug_assertions)]`-gated smoke hooks
  (`providers/smoke.rs`): compressed heartbeat cadence, deterministic stub
  summarizer, startup login-token injection, and a structured `SMOKE {json}`
  trace — all absent from the notarized release. Runbook:
  [`docs/SMOKE.md`](SMOKE.md).

- **Live Protocol snapshot emission (#34)** — The Context Heartbeat now frames
  `context_snapshot` and `session_end_marker` events and pushes them through
  the live Routing `WsSession` via the `WsSessionAgentSink` bridge at
  `lib.rs`. Delivery success stamps `pushed_at` when the frame is accepted
  into the outbound WebSocket channel (ADR-0005: at-most-once, no
  Runtime→Client ack). Committed golden fixtures in
  `src-tauri/fixtures/` plus `src/protocol-contract.test.ts` lock the Rust
  serializer to the live `@intentive/protocol` Zod contract (Rust ⟷ fixture ⟷
  Vitest). Regression coverage includes golden-frame parity and a live
  `WsSessionAgentSink` bridge test.

- **Capture Permission Setup + Desktop Capture Readiness interlock** ([Issue #32]) —
  `providers/permissions/` exposes check-only macOS grant probes behind a
  `CapturePermissions` trait seam (Screen Recording with Tauri/macOS-15+
  fallback, Microphone, Accessibility). The capture coordinator gates
  ScreenPipe and the Context Heartbeat on live **Desktop Capture Readiness**
  (all three grants) regardless of the Control Plane gate (ADR-0020).
  `capture/runtime/permission_monitor/` polls on a ~5s interval and emits
  readiness-lost events the coordinator maps to `SetupRequired`.
  `CapturePermissionSetup.tsx` (`?surface=permission-setup`) is a sequential
  Opal-style wizard (intro consent acknowledgment persisted in `localStorage`,
  one permission per step, deep-link + live recheck with ~1.5s UI polling,
  resume at first ungranted on re-entry).
  Tauri commands: `capture_permission_status`, `open_permission_pane`.
  Events: `permissions:status`. Menu bar surfaces **Finish Setup…** for
  `SetupRequired`. Routing `GET /agent` sends `x-capture-permission-granted`
  from the live Screen-Recording signal only (ADR-0020). ADR-0021 documents
  the ScreenPipe-adapted detection pattern.

- **Routing + Protocol WebSocket session skeleton** ([Issue #31]) —
  `src-tauri/src/domains/routing/` now owns `GET /agent`, Routing State,
  Session State, the Protocol `connect` handshake (`client_kind: "desktop"`),
  runtime-error decisions, exponential backoff with jitter, and Tauri commands
  for login-token handoff plus connection mood (`set_login_token`,
  `clear_login_token`, `get_connection_status`). Settings receives mood only
  (`routing:status`, replayed on mount); Routing values and JWTs stay in Rust.
  `agent_interface` is inert until #34 wires snapshot emission through the live
  session (`pushed_at = null` until then).

- **Context Heartbeat implementation** ([Issue #8]) — `src-tauri/src/context_heartbeat/`
  now runs a fixed 10-minute cadence service that:
  - queries ScreenPipe for the preceding activity window,
  - summarizes through the on-device LLM Provider seam,
  - writes each Context Snapshot to the Snapshot Store before delivery,
  - stamps `pushed_at` only when Agent Interface delivery succeeds, and
  - emits exactly one Session End Marker per active Capture Session end.
    Regression coverage includes first-tick timing, interval window shape,
    unresolved-provider skip behavior, write-before-push ordering, successful
    delivery marking, failed delivery retention with null `pushed_at`, and
    duplicate-stop marker suppression.

- **Capture-start provider preparation without implicit download** — startup
  wiring now prepares any already-available provider tier for the heartbeat via
  `LlmProvider::resolve_ready` while keeping Tier 3 model download behind the
  explicit onboarding `start_model_download` flow (ADR-0018).

- **Bundled-Ollama readiness and first-run onboarding** ([Issue #7]) — Intentive
  now ships the Apple Silicon Ollama binary at `src-tauri/resources/ollama` and
  spawns it on its own primary port (`44381`) with `44383` fallback per
  ADR-0013. The new
  onboarding surface (`?surface=onboarding`) walks the user through a one-time
  `qwen3.5:0.8b` download with a live percentage bar and a retry path on
  failure, per [ADR-0018](adr/0018-desktop-bundled-model-download-during-onboarding.md).
  Behind the scenes:
  - `LlmProvider::resolve_with_progress` exposes Tier 3 pull progress on a
    `tokio::sync::mpsc::Sender<PullProgress>` channel.
  - `start_model_download` Tauri command drives the resolve and forwards
    progress as `bundled-ollama:{progress,complete,failed}` events.
  - `SystemOllamaProcess` polls the local `/api/tags` endpoint for readiness;
    spawn fails after 10s if the HTTP boundary never becomes available.
  - New `port::resolve_port` helper (primary-to-fallback) is applied to the
    ScreenPipe supervisor and bundled Ollama spawn paths.
  - `model_is_present_on_disk` startup check opens the onboarding window only
    when the user is signed in and the model is genuinely absent.
- **`snapshot_store` Rust module** (`src-tauri/src/snapshot_store/`) — sqlx-backed
  local SQLite log per [ADR-0007](adr/0007-desktop-local-snapshot-log-with-retention.md).
  Public API: `SnapshotStore::new` (opens or creates the file, runs migrations,
  purges rows older than 7 days), `insert`, `mark_pushed` (idempotent single-UPDATE
  per ScreenPipe pattern), `list_recent`. `SnapshotStoreError` wraps `sqlx::Error`
  at the module boundary so callers do not depend on sqlx. The store accepts only
  `&ContextSnapshot` — raw ScreenPipe data has no representation in the API, which
  is the privacy boundary. Ten `tokio::test`s cover insert, mark-pushed,
  null-pushed-at, idempotency, NotFound, duplicate-id, ordering, and the 7-day
  retention boundary. Schema lives in `src-tauri/migrations/0001_create_snapshots.sql`
  and is applied via `sqlx::migrate!()` at startup.
- **`snapshot` Rust module** (`src-tauri/src/snapshot/`) — neutral home for
  `ContextSnapshot` per [ADR-0017](adr/0017-desktop-context-snapshot-in-shared-snapshot-module.md).
  Both `agent_interface` and `snapshot_store` import from here; neither depends
  on the other.
- **ADR-0016** records the sqlx-over-rusqlite choice for the snapshot store
  (matches ScreenPipe's own DB stack; built-in migration files; async-native).
- **ADR-0017** records the `ContextSnapshot` move to the shared `snapshot` module.
- **Snapshot Store wiring in `lib.rs`** — store is constructed at
  `BaseDirectory::AppLocalData/intentive.db` during Tauri setup and shared as
  `Arc<SnapshotStore>` via `app.manage`, ready for the Context Heartbeat slice.
- **Rust dependencies**: `sqlx 0.8` (`sqlite`, `runtime-tokio-rustls`, `chrono`,
  `migrate`, `macros`). Dev-dep: `tempfile`.
- **CONTEXT.md** gains canonical terms **Snapshot Store** and **Snapshot Privacy
  Boundary**, and standing rules **Implementation Pattern Rule** (follow
  ScreenPipe's patterns first) and **Schema Evolution Rule** (internal
  observability is a valid reason to add a column).
- **`agent_interface` Rust module** (`src-tauri/src/agent_interface/`) — `ContextSnapshot`
  payload type and `AgentInterface::push` HTTPS POST with `Authorization: Bearer`
  header, 10-second timeout, and drop-on-failure semantics per
  [ADR-0005](adr/0005-desktop-drop-failed-snapshot-pushes-v1.md). Six wiremock-driven
  tests cover the exact 5-field contract, non-2xx, timeout, and network failure paths.
- **`llm_provider` Rust module** (`src-tauri/src/llm_provider/`) — `LlmProvider::resolve`
  picks Apple Intelligence → existing Ollama → bundled Ollama per
  [ADR-0006](adr/0006-desktop-ollama-for-on-device-summarization.md);
  `LlmProvider::summarize` routes to the resolved tier with a privacy-constrained
  prompt. Tier 2 selects the currently loaded model from `/api/ps`, falls back to
  the first installed model ≤ 5GB on disk from `/api/tags`, and falls through to
  Tier 3 if neither qualifies. Eleven tests cover detection, selection, summarize
  routing, and the bundled-tier subprocess lifecycle via an `OllamaProcess` trait stub.
- **Vitest + jsdom + Testing Library** frontend test framework with one smoke test
  (`src/__tests__/smoke.test.tsx`). `npm test` now runs in CI after `npm run build`.
- **`capture_state` Rust module** (`src-tauri/src/capture_state/`) — pure Capture
  Session shell state machine for unauthenticated, stopped, capturing, and error
  states. Unit tests cover initial Auth-derived state, toggles, error transitions,
  recovery, and the current stub Auth checker behavior.
- **`menu_bar` Rust module** (`src-tauri/src/menu_bar/`) — Tauri tray icon setup,
  menu descriptors, command handlers, state holder, and icon mapping for the v1
  menu bar shell. Tests cover menu shape, icon selection, toggle behavior, and
  current stub sign-in state transitions.
- **Menu bar resources** (`src-tauri/icons/tray/`) and Tauri config updates for
  idle, capturing, and error tray icons plus the hidden settings window.
- **`capture_session` Rust module** (`src-tauri/src/capture_session/`) —
  ScreenPipe child-process lifecycle manager with pre-spawn port probing, start,
  stop, duplicate-start protection, one silent crash retry, and persistent Capture
  Error transitions. Eight tests cover the public `start`/`stop` behavior with
  fake process boundaries.
- **Bundled ScreenPipe resource** (`src-tauri/resources/screenpipe`) from the
  official `@screenpipe/cli-darwin-arm64@0.3.336` package, listed in Tauri
  resources and launched as `screenpipe record --port 44380`.
- **Neon Auth Settings surface** — React Settings now uses Neon Auth UI
  (`@neondatabase/neon-js`) with Google as the intended provider, plus
  `src/auth.ts` for the `VITE_NEON_AUTH_URL` boundary. Tests cover missing env,
  Neon Auth rendering, and absence of manual endpoint/API key fields.
- **ADR-0008** fixed the Context Heartbeat contract to a 10-minute cadence with
  Session End Marker emission on Capture Session end.
- **ADR-0009** locked auto-start-after-Auth semantics and made sign-in consent
  the gate before capture can begin.
- **ADR-0011/0012/0013/0014** document ScreenPipe retry behavior, shutdown-intent
  routing, unique bundled ports (`44380`/`44381`), and macOS CPU-variant rules
  for bundled native artifacts.
- **ADR-0015** documents final v1 release packaging and product-owned macOS
  permission identity: signed/notarized Apple Silicon DMG, product name
  **Intentive**, bundle identifier `com.heyintentive.tauri`, **Intentive** or
  fallback **Intentive Capture** in macOS Privacy Settings, and Capture Permission
  Setup as a release requirement.
- **[Issue #3] smoke checklist** for manually verifying
  the menu bar shell states.
- **Rust dependencies**: `reqwest` (rustls TLS), `tokio` (full features), `uuid`,
  `chrono`, `thiserror`, `url`, `async-trait`. Dev-dep: `wiremock`.

### Changed

- **Protocol delivery sink (#34)** — The heartbeat's `AgentSink` is now the live
  `WsSessionAgentSink` bridge (replacing the inert `NoopAgentSink` installed
  at startup). `NoopAgentSink` remains the documented default for wiring
  without a live session. ADR-0005 consequences now spell out socket-write
  semantics, per-tick at-most-once behavior, and matching rules for
  `session_end_marker`.

- **Capture Session lifecycle table** — the full shell-state transition table
  now lives in a pure `decide()` function in `capture/service/` (mirroring
  `routing::service::transition`). `CaptureStateMachine` is a thin state holder;
  the coordinator is wiring-only (`apply` + effect dispatch). Service tests
  hold the transition table; coordinator tests prove effect dispatch only.

- **Capture Permission Setup status emitter** —
  `providers/permissions/status_emitter/` polls grants on a ~1.5s cadence while
  the setup surface is open and emits `permissions:status` on change. A
  supervisor prevents duplicate emitter tasks; wake-grace suppression surfaces
  grant improvements immediately while filtering transient regressions after
  sleep/wake. Opening permission setup (menu bar or startup) centralizes through
  `menubar::ui::open_permission_setup`.

- **Routing outbound emit seam (#34 prep)** — `WsSession::try_emit` registers an
  mpsc outbound channel for the lifetime of each live WebSocket connection.
  `lib.rs` adds the dormant `WsSessionAgentSink` bridge framing
  `context_snapshot` / `session_end_marker` events; the heartbeat still uses
  `NoopAgentSink` until #34.

- **Lazy LLM Provider resolution in summarization runtime** —
  `LlmProviderSlot`, `LazyLlmProvider`, and `LiveProviderResolver` moved from
  `lib.rs` into `summarization/runtime/`. The composition root keeps only
  cross-domain trait bridges (`Summarizer`, future `AgentSink`).

- **Capture Session shell state** — `CaptureState` gains `SetupRequired`
  (signed in, idle, Desktop Capture Readiness false), distinct from
  `Stopped`, `Unauthenticated`, and `Error`. Mid-session grant revocation
  transitions to `SetupRequired` via the permission monitor (ADR-0020/0021).
  The coordinator routes permission-caused ScreenPipe crashes to
  `SetupRequired`, uses the poll as an `Error → SetupRequired` backstop when
  the crash-time probe lags revocation, ignores late supervisor `Stopped`
  events that would clobber `SetupRequired`/`Error`, and keeps user-paused
  `Stopped` across readiness revoke/restore.

- **Domain architecture refactor** — all Rust modules are now organized under `src-tauri/src/domains/` with the monorepo layer rule (`types → config → repo → service → runtime → ui`) enforced mechanically by the new `tools/linters/rust-architecture/` checker (`pnpm lint:architecture:rust`). Previous flat modules map to new locations:
  - `capture_state/` → `domains/capture/service/`
  - `capture_session/` → `domains/capture/runtime/coordinator/`
  - `screenpipe_supervisor/` → `domains/capture/runtime/screenpipe_supervisor/`
  - `snapshot/` → `domains/snapshots/types/`
  - `snapshot_store/` → `domains/snapshots/repo/`
  - `agent_interface/` → `domains/snapshots/runtime/agent_interface/`
  - `context_heartbeat/` → `domains/snapshots/runtime/heartbeat/`
  - `llm_provider/` → `domains/summarization/service/` (commands under `runtime/commands/`)
  - `menu_bar/` → `domains/menubar/service/` + `domains/menubar/ui/`
  - `port/` → `providers/port/` (Rust cross-cutting)
    No behavior changed; only file paths and module paths. Cross-domain coupling is now expressed via trait seams injected at `lib.rs`.
- **TS domain layout** — `src/auth.ts` → `src/domains/auth/service/auth.ts`; `src/Onboarding.tsx` → `src/domains/onboarding/ui/Onboarding.tsx`; new `src/domains/auth/ui/IntentiveAuthProvider.tsx` and `src/domains/account/ui/AccountSettingsSurface.tsx`. The layer rule from `ARCHITECTURE.md` now applies to both TS and Rust sides.
- **Issue #8 protocol-boundary hardening** — Desktop boundary semantics now align
  to the canonical protocol contract: no protocol-range negotiation fields,
  strict schema parsing, canonical snapshot/session-end naming
  (`snapshot_id`, `ended_at`, `reason`), and typed runtime failure envelope
  usage (`runtime_error`) across first-party contract surfaces.
- **Post-rebase onboarding repair** — the Settings/onboarding webview is now
  included in the Tauri event capability so live download progress and
  completion reach the user, command-dispatch failures surface Retry rather
  than an indefinite starting state, and the resolved bundled provider retains
  its Ollama child for later Context Heartbeats.
- **Issue #2 decisions locked and documented** ([Issue #2]):
  - Tier 3 bundled model confirmed: `qwen3.5:0.8b` (verified in Ollama registry).
  - Tier 2 model selection rule encoded in
    [ADR-0006](adr/0006-desktop-ollama-for-on-device-summarization.md): loaded model
    → first installed model ≤ 5GB on disk → fall through to Tier 3.
  - Agent Interface contract locked: 5-field JSON payload (`id`, `captured_at`,
    `period_start`, `period_end`, `summary`) + `Authorization` header, 10s timeout.
  - The corresponding "Open Questions" entries in [SPEC.md](SPEC.md) moved to
    the **Resolved** list.
- **`ContextSnapshot` relocated** from `agent_interface` to a shared `snapshot`
  module so `snapshot_store` and `agent_interface` can both import it without
  depending on each other (ADR-0017). No payload shape change.
- **[CONTEXT.md](../CONTEXT.md) — `LLM Provider`** definition updated to describe
  the Tier 2 selection rule.
- **Product docs aligned to ADR-0008/0009**: [README.md](../README.md),
  [SPEC.md](SPEC.md), [PRD.md](../../../docs/prd/desktop-PRD.md), [CONTEXT.md](../CONTEXT.md), and
  [ARCHITECTURE.md](ARCHITECTURE.md) now describe signed-in auto-start, consent
  as the Auth gate, fixed 10-minute Context Heartbeat behavior, and Session End
  Marker delivery.
- **Product docs aligned to ADR-0015**: [README.md](../README.md),
  [SPEC.md](SPEC.md), [PRD.md](../../../docs/prd/desktop-PRD.md), [CONTEXT.md](../CONTEXT.md), and
  [ARCHITECTURE.md](ARCHITECTURE.md) now describe capture-ready Auth, Capture
  Permission Setup, signed/notarized DMG release packaging, and product-owned
  macOS Privacy Settings identity.
- **Tray icons** — capturing dot recolored to Apple system green; both dots
  gain a transparent gap separating them from the head silhouette.
- ScreenPipe integration now uses Intentive-owned port `44380` (or `44382`
  fallback) instead of ScreenPipe's default `3030`; bundled Ollama uses `44381`
  (or `44383` fallback) while existing user Ollama stays on `11434`.
- **Capture Session coordinator** introduced
  (`src-tauri/src/capture_session/`): single owner of the shell-state FSM,
  consumes `CoordinatorCommand` (toggle, sign-in, simulated error) and drains
  `SupervisorEvent` from the ScreenPipe supervisor, notifying one
  `StateObserver` per transition. The original `src-tauri/src/capture_session/`
  module was renamed to `src-tauri/src/screenpipe_supervisor/`, which now
  publishes typed events instead of mutating the FSM via a `RefreshTray`
  callback. Removed `menu_bar/state_holder.rs`, `menu_bar/commands.rs`, and
  the per-handler tray-refresh choreography. Tauri commands now route through
  the coordinator; `StubAuthChecker` no longer leaks past `lib.rs`.

### Deferred

- Tier 3 production `OllamaProcess` (real subprocess spawn + `qwen3.5:0.8b` pull)
  is unwired and fails closed — resolve returns `ProviderError::Unavailable` rather
  than reporting a phantom `Tier::BundledOllama`. Real path lands when the
  bundled binary is acquired via Tauri resources. An `#[ignore]`d integration
  test (`integration_real_bundled_ollama_prepares_qwen`) is in place.
- Mid-session permission revocation detection is poll-only (~5s worst case) in
  #32; the ~100ms eager capture-stream-error path is deferred to #43.
- Signed/notarized release packaging evidence remains deferred and tracked
  against [SPEC.md](SPEC.md) Build Phases.

[Issue #2]: https://github.com/sruj75/Intentive/issues/2
[Issue #3]: https://github.com/sruj75/Intentive/issues/3
[Issue #7]: https://github.com/sruj75/Intentive/issues/7
[Issue #8]: https://github.com/sruj75/Intentive/issues/8
[Issue #31]: https://github.com/sruj75/Intentive/issues/31
[Issue #32]: https://github.com/sruj75/Intentive/issues/32
[Issue #34]: https://github.com/sruj75/Intentive/issues/34
