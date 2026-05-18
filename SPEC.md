# Intentive — v1 Specification

## What it is

Intentive is a macOS background service that captures what a user is doing on their computer, periodically compresses that activity into structured snapshots, and pushes them to an external AI agent (OpenClaw). It is infrastructure, not a product. v1 has no behavioral intelligence of its own.

---

## Architecture overview

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

---

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

## Core flow

1. User opens Intentive → Capture Session begins → ScreenPipe starts
2. Context Heartbeat fires every 60 seconds **if** activity detected via ScreenPipe WebSocket (`/ws/events`)
3. Heartbeat queries ScreenPipe HTTP API for activity since last snapshot
4. Raw data is sent to Ollama (`qwen3.5:0.8b`) with a privacy-guarded prompt → prose summary generated
5. Context Snapshot written to local SQLite
6. Snapshot pushed via HTTPS POST to OpenClaw Agent endpoint
7. If push fails → snapshot is dropped (v1). Local SQLite record remains.
8. User closes Intentive → Capture Session ends → ScreenPipe stops

---

## Context Snapshot

The unit of information delivered to OpenClaw Agent. Pre-digested for token efficiency.

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

## Subprocess management

### ScreenPipe
- Bundled binary in Tauri resources
- Spawned on Capture Session start, killed on stop/quit
- HTTP API: `localhost:3030`
- Integration boundary: Intentive queries the HTTP API only. SQLite is accessed directly only if the API cannot serve the need.

### Ollama
- Bundled binary in Tauri resources
- Detected first: if user already has Ollama running, use it. Otherwise spawn Intentive's bundled copy.
- HTTP API: `localhost:11434`
- Port `11434` conflict detection required
- Model: `qwen3.5:0.8b` — pulled on first launch

---

## First-run experience

1. Intentive opens
2. If Ollama model not present: progress screen shown — "Setting up Intentive…" (no mention of Ollama)
3. Model downloaded (~500MB–800MB, one-time)
4. Settings window opens for sign-in / endpoint configuration
5. Menu bar icon appears — ready

---

## Local SQLite schema

### `snapshots`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4 |
| `captured_at` | TEXT | ISO8601 |
| `period_start` | TEXT | ISO8601 |
| `period_end` | TEXT | ISO8601 |
| `summary` | TEXT | LLM-generated prose |
| `pushed_at` | TEXT | ISO8601, null if push failed |

Retention: 7 days. Entries older than 7 days are purged automatically.

---

## Agent Interface

- **Transport**: HTTPS POST
- **Payload**: Context Snapshot JSON (see above)
- **Auth**: API key in request header (configured post sign-in)
- **Endpoint**: user's OpenClaw Agent webhook URL on GCP VM, stored after auth
- **Failure handling (v1)**: drop on failure, no retry. `pushed_at` remains null in local log.
- **Future**: persist-and-retry queue (local SQLite), replay on reconnect

---

## UI surface (v1)

### Menu bar icon
- Status indicator: capturing / stopped / error
- Start / Stop capture
- Open Settings
- Quit

### Settings window
- Sign in / Sign up
- ScreenPipe status
- Capture toggle
- Basic config (endpoint URL visible post-auth)

### Out of scope for v1
- AI chat UI (talking to OpenClaw Agent directly)
- Snapshot history / transparency UI ← future, SQLite log is ready for it
- Notification / interruption system

---

## Privacy

- All capture and summarization is on-device
- LLM prompt includes explicit constraints: do not include passwords, credentials, financial data, or personal identifiers in the summary
- Local SQLite log stores only the sanitized summary, never raw screen/audio data
- HTTPS push is the only network egress during normal operation
- No telemetry in v1

---

## Deferred decisions

| Decision | Why deferred |
|---|---|
| Auth provider (Supabase vs Neon vs other) | Depends on OpenClaw Agent's backend stack; both built in parallel |
| Snapshot history / transparency UI | SQLite log is ready; UI is a future phase |
| Push retry / persist-and-retry | v1 drops on failure; revisit when reliability matters |
| Approach 2 (embed screenpipe-engine as Rust library) | Only if ScreenPipe HTTP API proves insufficient |

---

## Out of scope (v1)

- Behavioral analysis or goal comparison (that's OpenClaw's job)
- Windows / Linux support
- Cloud sync of snapshots
- Multiple agent endpoints
- AI chat UI
