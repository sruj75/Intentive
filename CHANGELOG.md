# Changelog

All notable changes to Intentive. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Added

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
  placeholder sign-in state transitions.
- **Menu bar resources** (`src-tauri/icons/tray/`) and Tauri config updates for
  idle, capturing, and error tray icons plus the hidden settings window.
- **ADR-0008** fixed the Context Heartbeat contract to a 10-minute cadence with
  Session End Marker emission on Capture Session end.
- **ADR-0009** locked auto-start-after-Auth semantics and made sign-in consent
  the gate before capture can begin.
- **Issue #3 smoke checklist** (`docs/smoke-issue-3.md`) for manually verifying
  the menu bar shell states.
- **Rust dependencies**: `reqwest` (rustls TLS), `tokio` (full features), `uuid`,
  `chrono`, `thiserror`, `url`, `async-trait`. Dev-dep: `wiremock`.

### Changed

- **Issue #2 decisions locked and documented**
  ([#2](https://github.com/sruj75/v1-macOS/issues/2)):
  - Tier 3 bundled model confirmed: `qwen3.5:0.8b` (verified in Ollama registry).
  - Tier 2 model selection rule encoded in
    [ADR-0006](docs/adr/0006-ollama-for-on-device-summarization.md): loaded model
    → first installed model ≤ 5GB on disk → fall through to Tier 3.
  - Agent Interface contract locked: 5-field JSON payload (`id`, `captured_at`,
    `period_start`, `period_end`, `summary`) + `Authorization` header, 10s timeout.
  - The corresponding "Open Questions" entries in [SPEC.md](SPEC.md) moved to
    the **Resolved** list.
- **[CONTEXT.md](CONTEXT.md) — `LLM Provider`** definition updated to describe
  the Tier 2 selection rule.
- **Product docs aligned to ADR-0008/0009**: [README.md](README.md),
  [SPEC.md](SPEC.md), [PRD.md](PRD.md), [CONTEXT.md](CONTEXT.md), and
  [ARCHITECTURE.md](ARCHITECTURE.md) now describe signed-in auto-start, consent
  as the Auth gate, fixed 10-minute Context Heartbeat behavior, and Session End
  Marker delivery.

### Deferred

- Tier 3 production `OllamaProcess` (real subprocess spawn + `qwen3.5:0.8b` pull)
  is unwired and fails closed — resolve returns `ProviderError::Unavailable` rather
  than reporting a phantom `Tier::BundledOllama`. Real path lands when the
  bundled binary is acquired via Tauri resources. An `#[ignore]`d integration
  test (`integration_real_bundled_ollama_prepares_qwen`) is in place.
- Real Auth remains unwired. The current menu bar sign-in surface is a placeholder
  and should not be treated as completed Auth or consent in production behavior.
- Tauri runtime wiring is partial: the menu bar shell is installed and commands are
  registered, but startup LLM Provider resolution and production capture
  orchestration are still deferred.
- ScreenPipe subprocess lifecycle, Context Heartbeat, SQLite snapshot log,
  first-run download UI, auth — tracked against
  [SPEC.md](SPEC.md) Build Phases.
