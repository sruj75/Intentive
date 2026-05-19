# Intentive — Architecture

Contract for v1: a macOS Tauri background service that manages ScreenPipe capture, runs on-device summarization, logs Context Snapshots locally, and pushes them to the OpenClaw Agent. Domain terms live in `CONTEXT.md`; acceptance criteria in `SPEC.md`; decisions in `docs/adr/`.

## Bird's-eye Overview

Intentive sits between three external systems and one user:

```
┌─────────────┐     HTTP/WS      ┌──────────────┐
│  ScreenPipe │◄────────────────►│              │
│  (child)    │   localhost:3030   │   Intentive  │
└─────────────┘                    │  (Tauri/Rust)│
                                   │              │
┌─────────────┐     HTTP           │  ┌────────┐  │     HTTPS POST
│ Ollama /    │◄───────────────────┼──│ Heart- │──┼────────────────► OpenClaw Agent
│ Apple Intel │   localhost:11434  │  │ beat   │  │   (GCP webhook)
└─────────────┘   (via ScreenPipe) │  └────────┘  │
                                   │      │        │
                                   │  SQLite log    │
                                   └──────┬─────────┘
                                          │ Tauri invoke / events
                                   ┌──────▼─────────┐
                                   │ Menu bar +     │
                                   │ settings (React)│
                                   └────────────────┘
```

**Capture Session** — User starts capture from the menu bar. Intentive spawns ScreenPipe, subscribes to activity signals, and runs the **Context Heartbeat** on a 60s cadence when meaningful activity occurred. Each cycle: query ScreenPipe → summarize via **LLM Provider** → write **Context Snapshot** to local SQLite → **push** via **Agent Interface** (if signed in). Stop or quit tears down ScreenPipe and Intentive-owned Ollama.

**Current implementation state** — The repo is past starter scaffold for two Rust domains (`llm_provider`, `agent_interface`). ScreenPipe lifecycle, Context Heartbeat, snapshot persistence, menu bar shell, and auth are specified but not yet wired in `lib.rs`. The UI is still the default Tauri window, not the ADR-0003 menu bar agent.

**Platform** — macOS only (v1). No Windows/Linux, no in-app agent reasoning, no push retry queue (ADR-0005).

## Codemap

| Path | Role |
|------|------|
| `src/` | React UI — target: menu bar status, settings window, first-run setup progress (ADR-0003). Today: starter `App.tsx` + Vitest smoke test. |
| `src-tauri/src/lib.rs` | Tauri entry: plugins, `invoke_handler`, app lifecycle. Orchestration modules will register commands here. |
| `src-tauri/src/llm_provider/` | **Deep module** — `resolve()` at startup (Apple Intelligence → existing Ollama → bundled Ollama); `summarize()` per heartbeat. Hides tier detection, prompts (`prompt.rs`), bundled binary spawn (`bundled.rs`). |
| `src-tauri/src/agent_interface/` | **Deep module** — `ContextSnapshot` payload type; `AgentInterface::push()` HTTPS POST with Bearer auth, 10s timeout, drop-on-failure (ADR-0004, ADR-0005). |
| `src-tauri/resources/` (planned) | Bundled ScreenPipe CLI and bundled Ollama binary per ADR-0002 / ADR-0006. |
| `references/` | Integration notes for ScreenPipe routes and Ollama APIs (agent/debug reference, not runtime code). |
| `CONTEXT.md` | Glossary — use these names in code and reviews. |
| `SPEC.md` | v1 requirements and payload contracts. |
| `DESIGN.md`, `.claude/commands/macos-design.md` | UI brand and native macOS patterns. |
| `docs/adr/` | Architectural decisions; do not contradict silently. |
| `.github/workflows/ci.yml` | PR quality gate: frontend typecheck/build/test; Rust check/clippy/test. |
| `.github/workflows/release.yml` | macOS release on `v*` tags. |

**Planned Rust modules** (names may vary; keep one concern per module, same depth as existing two):

- ScreenPipe subprocess manager — spawn/kill binary, health, crash → error state.
- Context Heartbeat — 60s timer, `/ws/events` activity gate, ScreenPipe HTTP fetch, call `LlmProvider::summarize`, coordinate snapshot write + push.
- Snapshot store — Intentive SQLite `snapshots` table, write-before-push, 7-day purge (ADR-0007).
- Capture session / runtime coordinator — ties start/stop, provider resolve, heartbeat lifecycle.

**Agent skills** — `.claude/skills/screenpipe-*` for operational debugging of the capture engine.

## Architectural Invariants

1. **macOS v1 only** — No cross-platform abstractions in core paths unless required by Tauri deps.
2. **Rust owns orchestration** — Capture, heartbeat, summarization routing, persistence, and delivery live in `src-tauri/`. The webview does not call ScreenPipe, Ollama, or the OpenClaw Agent directly.
3. **Thin UI boundary** — React talks to Rust only via Tauri commands and events. No business logic duplicated in `src/` that belongs in Rust.
4. **ScreenPipe via HTTP, not SQLite** — Integrate through the bundled CLI and `localhost:3030` (HTTP + WebSocket). Do not read ScreenPipe's database unless an API gap is documented and approved (ADR-0002). Embedding `screenpipe-engine` in-process is a targeted future escape hatch, not the default.
5. **Deep modules at integration seams** — `llm_provider` and `agent_interface` expose small public surfaces (`resolve`/`summarize`, `push` + `ContextSnapshot`). Callers do not branch on provider tiers or construct HTTP details.
6. **Context Snapshot contract is frozen for v1** — Payload fields: `id`, `captured_at`, `period_start`, `period_end`, `summary` only. Same shape for local SQLite and HTTPS push. Do not add fields without an explicit contract change.
7. **Write locally, then push** — Every snapshot is persisted before delivery attempt; `pushed_at` records success (ADR-0007). Push failure does not delete the local row (ADR-0005).
8. **Drop failed pushes** — No retry queue in v1; heartbeat continues on the next cycle (ADR-0005).
9. **On-device summarization** — Raw ScreenPipe content is input to the LLM Provider only; only sanitized prose leaves the machine (plus metadata in the snapshot).
10. **Push, not pull** — Intentive POSTs to the OpenClaw Agent; the agent does not poll the Mac (ADR-0004).
11. **Menu bar agent UX** — No Dock icon; no persistent main window (ADR-0003). Settings and first-run flows are separate windows.
12. **ADR supremacy** — If code conflicts with `docs/adr/`, fix code or record a new ADR; do not drift silently.

**Mechanical enforcement today** — CI runs `npx tsc --noEmit`, `npm run build`, `npm test`, `cargo check`, `cargo clippy -- -D warnings`, and `cargo test` on every PR. Module tests use `wiremock` for HTTP boundaries. This repo does not use the harness `Types → Config → Repo → Service → Runtime → UI` layer stack; boundaries are enforced by module privacy, ADR review, and the gates above.

## Boundaries

### Intentive ↔ ScreenPipe

- **Ownership** — Intentive bundles and spawns the ScreenPipe CLI; ScreenPipe owns capture storage in its SQLite DB.
- **Interface** — Child process lifecycle; REST on port 3030; activity WebSocket `/ws/events` for heartbeat gating.
- **Rule** — Context Heartbeat reads activity through ScreenPipe's API, not by opening ScreenPipe's DB file.

### Intentive ↔ LLM Provider (on-device)

- **Interface** — Tier 1: ScreenPipe `/ai/status` + `/ai/chat/completions`. Tier 2/3: Ollama HTTP at `localhost:11434` (existing or bundled subprocess).
- **Selection** — Fixed priority at startup (`LlmProvider::resolve`); user does not pick a model in v1.
- **Privacy** — Prompt constraints in `llm_provider/prompt.rs`; guardrails apply at summarization time, not when storing the summary (ADR-0007).

### Intentive ↔ OpenClaw Agent

- **Interface** — `AgentInterface::push` — HTTPS POST to user-configured webhook URL, `Authorization: Bearer <api_key>`, 10s timeout.
- **Semantics** — Agent is a black box; event-driven on receipt. Delivery requires network; capture may run without auth but snapshots are not pushed until signed in (`CONTEXT.md`).
- **Failure** — Non-2xx, timeout, or network error → delivery dropped; local row kept with `pushed_at` null.

### Intentive ↔ local data

- **Snapshot log** — Separate Intentive SQLite DB, table `snapshots`, 7-day retention purge on launch (ADR-0007).
- **Settings** — Endpoint URL, API key, capture preferences persisted across restarts (mechanism TBD; must not land in frontend-only storage).

### Frontend ↔ Rust (Tauri)

- **Commands** — Start/stop capture, open settings, read status, first-run progress, persist settings.
- **Events** — State changes (capturing / stopped / error), setup progress, push outcomes for UI if needed.
- **Security** — CSP in `tauri.conf.json` restricts webview network; production paths for localhost services are Rust-side only.

### Auth (deferred)

- Provider (Supabase vs Neon) undecided. v1 may persist endpoint + API key without full sign-in. When added, auth retrieves webhook URL and API key for the Agent Interface — not implemented in architecture until wired.

### CI / release

- **CI** — Ubuntu agents for compile/test; no macOS-specific UI tests in CI.
- **Release** — Tagged `v*` builds macOS app bundle via `release.yml`.

## Cross-cutting Concerns

**Configuration** — LLM endpoints default in `ProviderConfig` (`screenpipe_url`, `ollama_url`). User-facing agent endpoint and API key belong in persisted settings surfaced from the settings window.

**Logging and diagnostics** — Prefer structured Rust logging for heartbeat, provider tier, push results, and ScreenPipe child exit. ScreenPipe operational debugging: `.claude/skills/screenpipe-health`, `screenpipe-logs`, `screenpipe-api`.

**Errors** — Domain errors as `thiserror` enums inside modules (`PushError`, `ProviderError`). UI maps capture/push/provider failures to menu bar **error** state without crashing the heartbeat loop.

**Testing** — Rust: unit tests colocated (`agent_interface/tests`, `llm_provider/tests`, `wiremock` HTTP). Frontend: Vitest + Testing Library smoke tests. No E2E against real ScreenPipe in CI.

**Security posture** — Summaries only cross the network boundary to OpenClaw; API key in `Authorization` header only (SPEC resolved questions). Webview CSP limits exfiltration from UI code.

**Documentation hierarchy** — `ARCHITECTURE.md` (this file) = structure and invariants; `CONTEXT.md` = language; `SPEC.md` = behavior; `docs/adr/` = decisions; `DESIGN.md` = UI. Agents should read ADRs before changing boundaries.

**Known debt affecting shape** — Menu bar + `LSUIElement` not configured; heartbeat and ScreenPipe manager absent; auth provider open; `tauri.conf.json` still declares a default 800×600 window. Track against `SPEC.md` acceptance checklists.
