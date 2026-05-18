# Intentive — v1 Specification

---

## Problem Statement

AI agents that act on behalf of a user need to know what that user is actually doing — but today there is no standard, privacy-respecting way to deliver that context from a user's machine to a remote agent. Intentive solves the context delivery problem: it captures what is happening on the user's computer, compresses it into a clean, token-efficient summary on-device, and pushes it to OpenClaw Agent so the agent can reason about the user's current activity. Without this infrastructure layer, the agent is operating blind.

---

## Goals

1. **Reliable capture**: ScreenPipe runs without crashing for the full duration of a Capture Session — screen, audio, and UI events are recorded continuously.
2. **Clean context**: Every Context Snapshot delivered to OpenClaw is a coherent prose summary that accurately represents the user's activity in the preceding 60 seconds, with no raw screen data or sensitive information leaked.
3. **Silent operation**: The app runs in the background with zero user interruption during a Capture Session. Users interact with it only to start, stop, or configure.
4. **Privacy by default**: No user data leaves the device except the sanitized Context Snapshot summary sent to OpenClaw Agent over HTTPS.
5. **Compatibility**: The snapshot format and push mechanism work with OpenClaw Agent's GCP-hosted receiver from day one.

---

## Non-Goals

| Non-Goal | Why out of scope |
|---|---|
| Behavioral analysis or goal comparison | That is OpenClaw Agent's job. Intentive delivers context, the agent reasons about it. |
| Transparency / history UI | The SQLite log is ready for it, but the UI is a future phase. |
| Windows or Linux support | macOS-only for v1. ScreenPipe and Ollama both support cross-platform but broadening the target adds QA scope we do not have. |
| Push retry / persist-and-retry | Adds meaningful complexity. Acceptable to drop failed snapshots in v1. |
| AI chat UI inside the app | Future. A separate window for talking to OpenClaw directly is v2+. |
| Multiple agent endpoints | One endpoint per user in v1. Fan-out to multiple agents is a future concern. |

---

## User Stories

### End user (person running Intentive on their Mac)

- As an end user, I want to start a Capture Session from the menu bar so that Intentive begins feeding context to my agent without opening any windows.
- As an end user, I want to stop capture from the menu bar so that Intentive stops recording immediately and no more data is sent to my agent.
- As an end user, I want to see a status indicator in the menu bar so that I always know whether capture is active, stopped, or in an error state.
- As an end user, I want Intentive to set itself up automatically on first launch so that I do not have to manually install or configure ScreenPipe or Ollama.
- As an end user, I want my screen activity summarized on-device before anything is sent so that private information (passwords, financial data) is never transmitted in raw form.

### Developer / agent builder (person integrating OpenClaw Agent)

- As an agent builder, I want Intentive to push a Context Snapshot to a configured HTTPS endpoint every 60 seconds of user activity so that my agent can wake up and reason about what the user is doing.
- As an agent builder, I want each snapshot to contain a unique ID and timestamps so that I can deduplicate and order snapshots correctly in the agent's context window.
- As an agent builder, I want the snapshot payload to be a compact prose summary (not raw screen data) so that I can append it directly to the agent's context window without further processing.

---

## Requirements

### Must-Have (P0)

**Subprocess management — ScreenPipe**
- Intentive bundles the ScreenPipe CLI binary in Tauri resources
- On Capture Session start, spawns ScreenPipe as a child process; kills it on stop or quit
- If ScreenPipe crashes, the menu bar status updates to "error" state
- Acceptance:
  - [ ] ScreenPipe starts when the user clicks "Start" in the menu bar
  - [ ] ScreenPipe stops when the user clicks "Stop" or quits the app
  - [ ] Status indicator reflects live state: capturing / stopped / error

**Subprocess management — Ollama**
- Intentive bundles the Ollama CLI binary in Tauri resources
- On first launch, checks if Ollama is already running; uses existing instance if so, spawns bundled copy otherwise
- Detects port `11434` conflict; surfaces error if unresolvable
- Pulls `qwen3.5:0.8b` on first launch, shows progress UI ("Setting up Intentive…", no mention of Ollama)
- Acceptance:
  - [ ] First-run progress screen appears if model is not present
  - [ ] Model is downloaded and cached; subsequent launches skip this step
  - [ ] Ollama is available at `localhost:11434` before any Capture Session begins
  - [ ] If another Ollama is already running, Intentive uses it without spawning a duplicate

**Context Heartbeat**
- Fires every 60 seconds during a Capture Session
- Skips silently if no activity detected via ScreenPipe WebSocket (`/ws/events`) since last snapshot
- Queries ScreenPipe HTTP API (`localhost:3030`) for activity data from the last window
- Sends raw activity to Ollama with a privacy-guarded prompt; receives prose summary
- Acceptance:
  - [ ] Heartbeat does not fire when ScreenPipe reports no events in the window
  - [ ] LLM prompt explicitly instructs the model not to include passwords, credentials, financial data, or personal identifiers
  - [ ] Summary is coherent prose that a human or agent can understand without the raw source data

**Context Snapshot — local write**
- On each heartbeat, writes snapshot to local SQLite `snapshots` table before attempting push
- Schema: `id` (UUID), `captured_at`, `period_start`, `period_end`, `summary`, `pushed_at` (null until confirmed)
- Purges entries older than 7 days on app launch
- Acceptance:
  - [ ] Snapshot is written locally regardless of push success or failure
  - [ ] `pushed_at` is null if the push fails or is not yet attempted
  - [ ] Records older than 7 days are absent after the purge runs

**Context Snapshot — HTTPS push**
- POSTs each snapshot as JSON to the configured OpenClaw Agent endpoint immediately after local write
- Includes API key in request header for auth
- On failure (network error, non-2xx response, timeout): drops the snapshot, `pushed_at` remains null
- Acceptance:
  - [ ] Snapshot JSON matches the schema: `id`, `captured_at`, `period_start`, `period_end`, `summary`
  - [ ] Request includes `Authorization` header with API key
  - [ ] Failed pushes do not crash or stall the heartbeat; next cycle runs on schedule

**Menu bar UI**
- Menu bar icon with status: capturing (active), stopped (idle), error
- Menu items: Start / Stop, Open Settings, Quit
- No Dock icon (`LSUIElement = true`)
- Acceptance:
  - [ ] App appears in menu bar only — not in the Dock
  - [ ] Status icon updates within 2 seconds of state change
  - [ ] "Start" is disabled when already capturing; "Stop" is disabled when stopped

**Settings window**
- Triggered from menu bar
- Fields: sign in / sign up (deferred, placeholder for now), OpenClaw Agent endpoint URL, API key
- ScreenPipe status display
- Capture toggle
- Acceptance:
  - [ ] Endpoint URL and API key are persisted across app restarts
  - [ ] Settings window can be closed without affecting an active Capture Session

---

### Nice-to-Have (P1)

- **Capture Session auto-start on login**: Intentive registers as a macOS Login Item so capture begins automatically when the user logs in — no manual "Start" needed.
- **Error notifications**: Native macOS notification when ScreenPipe crashes or push fails repeatedly, so the user knows without checking the menu bar.
- **Model warm-up**: Keep Ollama loaded between heartbeat cycles rather than cold-loading each time, reducing summarization latency.

---

### Future Considerations (P2)

- **Transparency / history UI**: A window that shows recent Context Snapshots — what was captured, what was sent. The local SQLite log is already structured for this.
- **Persist-and-retry**: Queue failed pushes to SQLite, replay when connectivity restores. Schema already has `pushed_at` for this.
- **Auth provider**: Full sign in / sign up flow once the OpenClaw Agent backend database is finalized (Supabase vs Neon TBD).
- **AI chat UI**: A window for the user to talk to OpenClaw Agent directly inside Intentive.
- **Multiple agent endpoints**: Fan-out to more than one agent per user.
- **Approach 2 (embed screenpipe-engine)**: If the ScreenPipe HTTP API cannot serve a specific need, embed `screenpipe-engine` as a Rust library for in-process control.

---

## Success Metrics

Since v1 is infrastructure, success is measured by reliability and correctness — not user engagement.

### Leading indicators (days to weeks post-launch)

| Metric | Target |
|---|---|
| Snapshot delivery rate | ≥ 95% of generated snapshots successfully pushed (non-error sessions) |
| Heartbeat accuracy | Heartbeat skips ≥ 90% of idle windows (no false fires during inactivity) |
| Summarization latency | Ollama generates summary in < 5 seconds on M-series hardware |
| First-run completion | User reaches "ready" state (Ollama model downloaded, settings configured) without manual intervention |

### Lagging indicators (weeks post-launch)

| Metric | Target |
|---|---|
| ScreenPipe crash rate | < 1 crash per 8-hour Capture Session |
| Privacy incident rate | Zero snapshots containing raw passwords, credentials, or financial data (verified via manual audit of local log) |
| OpenClaw Agent compatibility | Agent receives and processes snapshots without format errors from day one |

---

## Open Questions

| Question | Owner | Blocking? |
|---|---|---|
| Exact Ollama model tag for `qwen3.5:0.8b` — verify this tag exists in the Ollama registry | Engineering | Yes — needed before first-run implementation |
| Auth provider (Supabase vs Neon) | Stakeholder — depends on OpenClaw Agent backend decision | No — auth is the last thing wired in v1 |
| Does OpenClaw Agent's receiver expect any specific headers beyond `Authorization`? (e.g. `Content-Type`, `X-Intentive-Version`) | Agent builder / Engineering | Yes — needed before push implementation |
| What is the timeout threshold for HTTPS push before declaring failure? | Engineering | No — can default to 10s and adjust |

---

## Build Phases

Intentive is built incrementally. Each phase is shippable on its own.

| Phase | What ships | Depends on |
|---|---|---|
| **1. Subprocess shell** | Tauri app skeleton, menu bar icon, ScreenPipe spawning/killing, status indicator | Rust + Tauri CLI installed |
| **2. Ollama integration** | First-run model download UI, Ollama lifecycle management, test summarization call | Phase 1 |
| **3. Context Heartbeat** | Activity detection via WebSocket, 60s cadence, summarization pipeline, local SQLite write | Phase 2 |
| **4. Push pipeline** | HTTPS POST to OpenClaw endpoint, API key header, failure drop, `pushed_at` tracking | Phase 3, OpenClaw receiver ready |
| **5. Settings window** | Endpoint URL + API key config, ScreenPipe status, capture toggle | Phase 4 |
| **6. Auth** | Sign in / sign up wired to identity provider | Auth provider decision made |

---

## Architecture Overview

```
macOS (user's machine)
│
├── Intentive (Tauri menu bar app)
│   ├── Manages ScreenPipe subprocess (capture)
│   ├── Manages Ollama subprocess (summarization)
│   ├── Context Heartbeat service (60s, activity-gated)
│   ├── Local SQLite log (snapshots, 7-day retention)
│   └── HTTPS push → OpenClaw Agent (GCP VM)
│
├── ScreenPipe CLI binary (bundled)
│   └── HTTP API on localhost:3030
│
└── Ollama CLI binary (bundled)
    └── HTTP API on localhost:11434
        └── Model: qwen3.5:0.8b
```

## Stack

| Layer | Choice | Reason |
|---|---|---|
| App framework | Tauri 2.x | Lightweight, Rust-native, menu bar support, no Chromium |
| Frontend | TypeScript + React | Standard Tauri stack |
| Capture engine | ScreenPipe CLI binary (bundled) | Wraps, not reimplements; HTTP API is the boundary |
| On-device LLM | Ollama (bundled) + `qwen3.5:0.8b` | Single standard, on-device, private, no API keys |
| Local storage | SQLite (via Tauri plugin) | Snapshot log + future transparency UI |
| Agent transport | HTTPS POST (JSON) | OpenClaw Agent lives on GCP VM |

---

## Context Snapshot Payload

```json
{
  "id": "uuid-v4",
  "captured_at": "2025-01-15T14:32:00Z",
  "period_start": "2025-01-15T14:31:00Z",
  "period_end": "2025-01-15T14:32:00Z",
  "summary": "User spent 60s in Figma editing a dashboard component, briefly checked Slack, then opened Chrome to review a Notion doc titled 'Q3 Roadmap'."
}
```

Raw ScreenPipe data (OCR text, audio transcript, app/window fields) is consumed internally during summarization. It is not stored in the local log or sent to the agent.

---

## Privacy

- All capture and summarization is on-device
- LLM prompt includes explicit constraints: do not include passwords, credentials, financial data, or personal identifiers
- Local SQLite log stores only the sanitized summary — never raw screen or audio data
- HTTPS push to OpenClaw Agent is the only network egress during normal operation
- No telemetry in v1

---

## Deferred Decisions

| Decision | Why deferred |
|---|---|
| Auth provider (Supabase vs Neon vs other) | Depends on OpenClaw Agent backend stack; both projects built in parallel |
| Snapshot history / transparency UI | SQLite log is ready; UI is a future phase |
| Push retry / persist-and-retry | v1 drops on failure; revisit when reliability matters |
| Approach 2 (embed screenpipe-engine as Rust library) | Only if ScreenPipe HTTP API proves insufficient for a specific gap |
