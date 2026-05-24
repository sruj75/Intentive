# Changelog

All notable changes to Intentive. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Added

- **Bundled-Ollama readiness and first-run onboarding** ([Issue #7]) — Intentive
  now ships the Apple Silicon Ollama binary at `src-tauri/resources/ollama` and
  spawns it on its own primary port (`44381`) with `44383` fallback per
  ADR-0013. The new
  onboarding surface (`?surface=onboarding`) walks the user through a one-time
  `qwen3.5:0.8b` download with a live percentage bar and a retry path on
  failure, per [ADR-0018](docs/adr/0018-bundled-model-download-during-onboarding.md).
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
  local SQLite log per [ADR-0007](docs/adr/0007-local-snapshot-log-with-retention.md).
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
  `ContextSnapshot` per [ADR-0017](docs/adr/0017-context-snapshot-in-shared-snapshot-module.md).
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
  [ADR-0005](docs/adr/0005-drop-failed-snapshot-pushes-v1.md). Six wiremock-driven
  tests cover the exact 5-field contract, non-2xx, timeout, and network failure paths.
- **`llm_provider` Rust module** (`src-tauri/src/llm_provider/`) — `LlmProvider::resolve`
  picks Apple Intelligence → existing Ollama → bundled Ollama per
  [ADR-0006](docs/adr/0006-ollama-for-on-device-summarization.md);
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
- **Issue #3 smoke checklist** for manually verifying
  the menu bar shell states.
- **Rust dependencies**: `reqwest` (rustls TLS), `tokio` (full features), `uuid`,
  `chrono`, `thiserror`, `url`, `async-trait`. Dev-dep: `wiremock`.

### Changed

- **Post-rebase onboarding repair** — the Settings/onboarding webview is now
  included in the Tauri event capability so live download progress and
  completion reach the user, command-dispatch failures surface Retry rather
  than an indefinite starting state, and the resolved bundled provider retains
  its Ollama child for later Context Heartbeats.
- **Issue #2 decisions locked and documented**
  ([#2](https://github.com/sruj75/v1-tauri/issues/2)):
  - Tier 3 bundled model confirmed: `qwen3.5:0.8b` (verified in Ollama registry).
  - Tier 2 model selection rule encoded in
    [ADR-0006](docs/adr/0006-ollama-for-on-device-summarization.md): loaded model
    → first installed model ≤ 5GB on disk → fall through to Tier 3.
  - Agent Interface contract locked: 5-field JSON payload (`id`, `captured_at`,
    `period_start`, `period_end`, `summary`) + `Authorization` header, 10s timeout.
  - The corresponding "Open Questions" entries in [SPEC.md](SPEC.md) moved to
    the **Resolved** list.
- **`ContextSnapshot` relocated** from `agent_interface` to a shared `snapshot`
  module so `snapshot_store` and `agent_interface` can both import it without
  depending on each other (ADR-0017). No payload shape change.
- **[CONTEXT.md](CONTEXT.md) — `LLM Provider`** definition updated to describe
  the Tier 2 selection rule.
- **Product docs aligned to ADR-0008/0009**: [README.md](README.md),
  [SPEC.md](SPEC.md), [PRD.md](PRD.md), [CONTEXT.md](CONTEXT.md), and
  [ARCHITECTURE.md](ARCHITECTURE.md) now describe signed-in auto-start, consent
  as the Auth gate, fixed 10-minute Context Heartbeat behavior, and Session End
  Marker delivery.
- **Product docs aligned to ADR-0015**: [README.md](README.md),
  [SPEC.md](SPEC.md), [PRD.md](PRD.md), [CONTEXT.md](CONTEXT.md), and
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
- Auth-resolved Agent Interface configuration remains unwired. Neon Auth UI is
  present, but mapping a signed-in user to an OpenClaw Agent endpoint and
  credential lands in the follow-up Auth/Data API slice.
- Tauri runtime wiring is partial: the menu bar shell, ScreenPipe subprocess
  manager, and snapshot store are installed, but startup LLM Provider
  resolution, Context Heartbeat (which will drive `SnapshotStore::insert` and
  `mark_pushed`), first-run download UI, Capture Permission Setup,
  signed/notarized release packaging, and completed Auth gating are still
  deferred and tracked against [SPEC.md](SPEC.md) Build Phases.
