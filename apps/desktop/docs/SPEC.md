# Intentive — v1 Specification

---

## Problem Statement

AI agents that act on behalf of a user need to know what that user is actually doing — but today there is no standard, privacy-respecting way to deliver that context from a user's machine to a remote agent. Intentive solves the context delivery problem: it captures what is happening on the user's computer, compresses it into a clean, token-efficient summary on-device, and emits it to the Agent Runtime as a `context_snapshot` event on the shared WebSocket Protocol, so the agent can reason about the user's current activity. Without this infrastructure layer, the agent is operating blind.

---

## Goals

1. **Reliable capture**: ScreenPipe runs without crashing for the full duration of a Capture Session — screen, audio, and UI events are recorded continuously.
2. **Clean context**: Every Context Snapshot delivered to the Agent Runtime is a coherent prose summary that accurately represents the user's activity in the preceding 10-minute window, with no raw screen data or sensitive information leaked.
3. **Silent operation**: The Desktop Client runs in the background with zero user interruption during a Capture Session. Launch starts capture automatically only after Auth and live **Desktop Capture Readiness** on this Mac (all three macOS grants; ADR-0020); users interact with it only to stop, restart, sign in, or complete setup.
4. **Privacy by default**: No user data leaves the device except the sanitized Context Snapshot summary emitted to the Agent Runtime over the WebSocket Protocol.
5. **Compatibility**: The `context_snapshot` event payload conforms to the schema in `packages/protocol/` and is accepted by the Agent Runtime's WebSocket gateway from day one.
6. **Finished macOS product packaging**: v1 ships as a Developer ID signed and notarized Apple Silicon DMG containing only `Intentive.app`, and macOS Privacy Settings shows **Intentive** or fallback **Intentive Capture** as the capture permission owner.

---

## Non-Goals

| Non-Goal                               | Why out of scope                                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Behavioral analysis or goal comparison | That is the Agent Runtime's job. Intentive delivers context, the runtime reasons about it.                                                                                                                                      |
| Transparency / history UI              | The Snapshot Store is ready for it, but the UI is a future phase.                                                                                                                                                               |
| Windows or Linux support               | macOS-only for v1. ScreenPipe and Ollama both support cross-platform but broadening the target adds QA scope we do not have.                                                                                                    |
| Intel Mac support                      | v1 targets **Apple Silicon (M-series) Macs only**. Intentive bundles `@screenpipe/cli-darwin-arm64` only (ADR-0014). Intel (`cli-darwin-x64`) and packaging strategy (separate builds vs dual-binary app) are future decisions. |
| Client-side retry queue                | Adds meaningful complexity. Delivery is at-most-once in v1; reconnect-snapshot semantics in the Protocol handle recovery.                                                                                                       |
| Chat UI inside the Desktop Client      | Out of scope for v1 by design — Desktop is **capture-only**. Chat lives on the Mobile Client (and future Android Client).                                                                                                       |
| Multiple Agent Instances per user      | One Agent Instance per user in v1. Fan-out is a future concern.                                                                                                                                                                 |

---

## User Stories

### End user (person running Intentive on their Mac)

- As an end user, I want the Desktop Client to automatically start a Capture Session after this Mac is authorized for capture so that context is available without a manual start step.
- As an end user, I want to stop capture from the menu bar so that Intentive stops recording immediately and no more data is sent to my agent.
- As an end user, I want to see a status indicator in the menu bar so that I always know whether capture is active, stopped, or in an error state.
- As an end user, I want Intentive to set itself up automatically on first launch so that I do not have to manually install or configure ScreenPipe or Ollama.
- As an end user, I want my screen activity summarized on-device before anything is sent so that private information (passwords, financial data) is never transmitted in raw form.
- As an end user, I want desktop capture consent requested on the Mac that records my screen so that signing in or onboarding on mobile never authorizes Mac capture silently.
- As an end user, I want Capture Permission Setup to guide me through macOS Privacy Settings step by step with clear screenshots so that I can grant capture permissions without guessing where to click.
- As an end user, I want macOS Privacy Settings to show Intentive, not ScreenPipe or a debug path, so that I can trust the product requesting capture permissions.

### Developer / agent builder (person integrating Agent Runtime)

- As an agent builder, I want Intentive to emit a `context_snapshot` event on the WebSocket Protocol every 10 minutes during a Capture Session so that the Agent Runtime processes new activity through the same unified channel every client uses.
- As an agent builder, I want Intentive to send a Session End Marker when a Capture Session ends so that my agent can distinguish an active quiet period from the user stopping or quitting.
- As an agent builder, I want each snapshot to contain a unique ID and timestamps so that I can deduplicate and order snapshots correctly in the agent's context window.
- As an agent builder, I want the snapshot payload to be a compact prose summary (not raw screen data) so that I can append it directly to the agent's context window without further processing.

---

## Requirements

### Must-Have (P0)

**Subprocess management — ScreenPipe**

- Intentive bundles the ScreenPipe CLI binary in Tauri resources
- On signed-in launch or manual restart, spawns ScreenPipe as a child process on `127.0.0.1:44380`; kills it on stop or quit
- The Desktop Client does not spawn ScreenPipe without completed Auth and live **Desktop Capture Readiness** on this Mac (all three grants present right now)
- Capture Permission Setup on this Mac collects consent and guides the three required grants; the Mac enforces the interlock locally. The Control Plane `capture_permission_setup` gate is a coarser policy nudge that sees only the live Screen-Recording signal (ADR-0020)
- If ScreenPipe exits unexpectedly, Intentive retries once silently; a second unexpected exit moves the menu bar to error state
- If port `44380` is already in use, Intentive enters error state without spawning ScreenPipe
- Acceptance:
  - [ ] ScreenPipe starts automatically when a signed-in user launches the Desktop Client and live Desktop Capture Readiness is true on this Mac
  - [ ] ScreenPipe does not start for an unauthenticated user
  - [ ] ScreenPipe does not start for a signed-in user without live Desktop Capture Readiness on this Mac, including a user onboarded only in the Mobile Client
  - [ ] ScreenPipe stops when the user toggles capture off or quits Intentive
  - [ ] Duplicate start actions do not create duplicate ScreenPipe processes
  - [ ] One unexpected ScreenPipe exit is retried silently; a second unexpected exit surfaces error
  - [ ] Status indicator reflects live state: capturing / stopped / error

**LLM Provider detection**

- On startup, Intentive resolves its LLM Provider in priority order:
  1. **Apple Intelligence**: query ScreenPipe `/ai/status`; if available, use `/ai/chat/completions`
  2. **Existing Ollama**: check `localhost:11434`; if responding, select the currently loaded model or first installed model ≤ 5GB on disk; fall through to Tier 3 if none qualify
  3. **Bundled Ollama**: spawn Intentive's bundled Ollama binary; pull `qwen3.5:0.8b` on first run
- First-run download (tier 3 only) shows progress UI: "Setting up Intentive…" — no mention of Ollama
- Detects port `11434` conflict for the bundled path; surfaces error if unresolvable
- Acceptance:
  - [ ] If Apple Intelligence is available via ScreenPipe, it is used and no Ollama process is spawned
  - [ ] If Ollama is already running at `localhost:11434` with a model ≤ 5B available, Intentive uses it without spawning a duplicate
  - [ ] If Ollama is running but no model ≤ 5B is found, Intentive falls through to Tier 3 (bundled Ollama + `qwen3.5:0.8b`)
  - [ ] First-run progress screen appears whenever `qwen3.5:0.8b` needs to be downloaded (Tier 3, including Tier 2 fallthrough)
  - [ ] Model is downloaded and cached; subsequent launches on tier 3 skip the download
  - [ ] LLM Provider is resolved and ready before any Capture Session begins

**Context Heartbeat**

- Fires every 10 minutes during a Capture Session
- Always fires on schedule; it does not skip quiet or unchanged windows
- Queries ScreenPipe HTTP API (`localhost:44380`) for activity data from the preceding 10-minute window
- Sends raw activity to Ollama with a privacy-guarded prompt; receives prose summary
- Acceptance:
  - [ ] Heartbeat fires on the 10-minute cadence during a Capture Session, even when state is unchanged
  - [ ] LLM prompt explicitly instructs the model not to include passwords, credentials, financial data, or personal identifiers
  - [ ] Summary is coherent prose that a human or agent can understand without the raw source data
  - [ ] Session End Marker is sent immediately when a Capture Session ends from stop, quit, or ScreenPipe crash

**Context Snapshot — local write**

- On each heartbeat, writes snapshot to local SQLite `snapshots` table before attempting push
- Schema: `id` (UUID), `captured_at`, `period_start`, `period_end`, `summary`, `pushed_at` (null until socket-write acceptance)
- Purges entries older than 7 days on app launch
- Acceptance:
  - [ ] Snapshot is written locally regardless of push success or failure
  - [ ] `pushed_at` is null if the push fails or is not yet attempted
  - [ ] Records older than 7 days are absent after the purge runs

**Context Snapshot — Protocol delivery**

- Emits each snapshot as a `context_snapshot` event on the open WebSocket immediately after local write
- The WebSocket connection is authenticated once at `connect` using the Control Plane-issued JWT; no per-event auth header
- On a dropped connection, timeout, or rejected event: the snapshot stays in the Snapshot Store with `pushed_at = null`; no client-side retry queue in v1
- Acceptance:
  - [ ] `context_snapshot` event payload matches the schema in `packages/protocol/`: `snapshot_id`, `captured_at`, `period_start`, `period_end`, `summary`
  - [x] WebSocket `connect` handshake includes `client_kind: "desktop"` and the Control Plane-issued JWT
  - [x] Connection drops do not crash or stall the heartbeat; the next cycle runs on schedule and reconnect uses the Protocol's reconnect-snapshot semantics
  - [ ] `session_end_marker` event is a separate Protocol event type, not a flag on `context_snapshot`

**Menu bar UI**

- Menu bar icon with status: capturing (active), stopped (idle), error
- Menu items: Unauthenticated (when signed out), Start Capturing / Stop Capturing toggle (when signed in), Open Settings, Quit
- No Dock icon (`LSUIElement = true`)
- Acceptance:
  - [ ] App appears in menu bar only — not in the Dock
  - [ ] Status icon updates within 2 seconds of state change
  - [ ] Unauthenticated state shows only a clickable sign-in/consent entry, with the rest disabled
  - [ ] Signed-in stopped state shows one enabled "Start Capturing" toggle
  - [ ] Capturing state shows one enabled "Stop Capturing" toggle

**Settings window**

- Triggered from menu bar
- Auth/account surface uses Neon Auth UI with Google as the intended OAuth provider
- Settings may mirror user-facing Intentive status, but it is not a ScreenPipe diagnostics panel
- Routing details (Agent Runtime URL and JWT) are resolved internally by Control Plane's `GET /agent`, not entered by the user
- Acceptance:
  - [x] Settings renders Neon Auth sign-in/account controls
  - [x] Settings does not expose endpoint URL or token fields
  - [ ] Settings does not expose ScreenPipe readiness or diagnostics
  - [ ] Settings window can be closed without affecting an active Capture Session
  - [ ] Opening the sign-in surface alone does not start capture; only completed Auth plus live Desktop Capture Readiness on this Mac can do that

**Capture Permission Setup**

- Collects Mac-specific desktop capture consent and guides users through required macOS Privacy Settings grants before capture can auto-start on this Mac
- Uses static bundled instructional screenshots in the style of Opal, paired with live OS permission checks
- Required v1 grants: Screen & System Audio Recording, Microphone, and Accessibility
- Opens the exact macOS Privacy Settings pane when possible, falls back to Privacy & Security when needed, and offers a manual recheck
- Acceptance:
  - [ ] Capture Permission Setup presents one required permission at a time with curated instructional screenshots.
  - [ ] Capture Permission Setup can open or deep-link to the relevant macOS Privacy Settings pane, with a fallback to Privacy & Security.
  - [ ] Capture Permission Setup waits for live OS grant detection before advancing to the next step.
  - [ ] Capture Permission Setup exposes a Recheck action for already-granted permissions.
  - [ ] Capture Permission Setup is incomplete until Screen & System Audio Recording, Microphone, and Accessibility are granted.
  - [ ] A Capture Session cannot auto-start until Capture Permission Setup is complete on this Mac and live Desktop Capture Readiness is true (all three grants).
  - [ ] User-facing copy says Intentive and never exposes ScreenPipe diagnostics.

**Release packaging and macOS identity**

- v1 ships as a direct-download Apple Silicon DMG containing only `Intentive.app`
- Release builds are Developer ID signed and Apple-notarized; unsigned builds are dev-only
- Product name is **Intentive** and bundle identifier is `com.heyintentive.tauri`
- macOS Privacy Settings must show **Intentive** as the permission owner, with **Intentive Capture** as the only acceptable fallback helper identity
- Acceptance:
  - [ ] Tagged release builds produce a signed and notarized DMG containing only `Intentive.app`.
  - [ ] The installed app at `/Applications/Intentive.app` launches as a menu bar app with no Dock icon.
  - [ ] macOS Privacy Settings shows **Intentive** or fallback **Intentive Capture** for required capture grants.
  - [ ] macOS Privacy Settings does not show ScreenPipe, lowercase `intentive`, raw helper names, or debug paths for release permission identity.
  - [ ] Login Items, when enabled, shows **Intentive**.
  - [ ] Release smoke verifies ScreenPipe health on `127.0.0.1:44380`, frame writes, microphone audio chunks, and system-audio chunks.
  - [ ] Stop Capturing removes the ScreenPipe listener/process and returns the tray to stopped.
  - [ ] Quit leaves no Intentive-owned ScreenPipe process behind.

---

### Nice-to-Have (P1)

- **Launch at login**: Intentive registers as a macOS Login Item so the app launches automatically when the user logs in; Capture Session auto-start still requires the user to be signed in.
- **Error notifications**: Native macOS notification when ScreenPipe crashes or push fails repeatedly, so the user knows without checking the menu bar.
- **Model warm-up**: Keep Ollama loaded between heartbeat cycles rather than cold-loading each time, reducing summarization latency.

---

### Future Considerations (P2)

- **Transparency / history UI**: A window that shows recent Context Snapshots — what was captured, what was sent. The local SQLite log is already structured for this.
- **Persist-and-retry**: Queue snapshots with `pushed_at = null` and re-emit on reconnect once at-most-once becomes insufficient. Schema already has `pushed_at` for this.
- **Routing-derived Protocol config**: Map the signed-in user to one Agent Runtime URL + JWT via Control Plane (already the v1 path; making it observable in Settings is a future nice-to-have).
- **Chat UI on Desktop**: Currently rejected — Desktop is capture-only. May revisit only if a desktop-specific chat need emerges.
- **Multiple Agent Instances per user**: Fan-out to more than one Agent Instance per user.
- **Approach 2 (embed screenpipe-engine)**: If the ScreenPipe HTTP API cannot serve a specific need, embed `screenpipe-engine` as a Rust library for in-process control.

---

## Success Metrics

Since v1 is infrastructure, success is measured by reliability and correctness — not user engagement.

### Leading indicators (days to weeks post-launch)

| Metric                     | Target                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Snapshot delivery rate     | ≥ 95% of generated snapshots accepted into the live WebSocket session (non-error sessions; ADR-0005)  |
| Heartbeat cadence accuracy | Heartbeat fires every 10 minutes during Capture Sessions with no activity-gated skips                 |
| Summarization latency      | Ollama generates summary in < 5 seconds on M-series hardware                                          |
| First-run completion       | User reaches "ready" state (Ollama model downloaded, settings configured) without manual intervention |

### Lagging indicators (weeks post-launch)

| Metric                      | Target                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| ScreenPipe crash rate       | < 1 crash per 8-hour Capture Session                                                                                                    |
| Privacy incident rate       | Zero snapshots containing raw passwords, credentials, or financial data (verified via manual audit of local log)                        |
| Agent Runtime compatibility | Agent Runtime gateway accepts and processes `context_snapshot` events without protocol-version mismatches or schema errors from day one |

---

## Open Questions

No open blocking questions remain for the currently documented v1 contracts.

**Resolved:**

- Auth provider: Neon Auth, built on Better Auth. Google is the intended v1 OAuth provider.
- Model tag: `qwen3.5:0.8b` — confirmed in Ollama registry. Tier 3 bundled model. Tier 2 uses existing models ≤ 5GB on disk, falls through to Tier 3 if none qualify.
- Transport: WebSocket Protocol (`packages/protocol/`); JWT once at `connect`; no per-event auth header.
- Failure handling: at-most-once delivery in v1. On dropped connection, timeout, or rejected event, the snapshot stays in the Snapshot Store with `pushed_at = null`; reconnect-snapshot semantics in the Protocol handle recovery. See ADR-0011.

---

## Build Phases

Intentive is built incrementally. Each phase is shippable on its own.

| Phase                     | What ships                                                                                                                                                           | Depends on                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **1. Subprocess shell**   | Tauri app skeleton, menu bar icon, ScreenPipe spawning/killing, status indicator                                                                                     | Rust + Tauri CLI installed                       |
| **2. Ollama integration** | First-run model download UI, Ollama lifecycle management, test summarization call                                                                                    | Phase 1                                          |
| **3. Context Heartbeat**  | Fixed 10-minute cadence, summarization pipeline, local SQLite write, Session End Marker on stop/quit/crash                                                           | Phase 2                                          |
| **4. Settings window**    | Neon Auth UI account surface; no manual endpoint or token fields                                                                                                     | Phase 1                                          |
| **5. Routing**            | Signed-in user calls Control Plane's `GET /agent`, receives Agent Runtime URL + JWT, Rust maintains the Protocol WebSocket session skeleton                          | Settings window, Neon Auth, Control Plane online |
| **6. Protocol pipeline**  | `context_snapshot` + `session_end_marker` emission over the live WebSocket; socket-write acceptance stamps `pushed_at`; dropped connection leaves `pushed_at = null` | Phase 3, Routing, Agent Runtime gateway ready    |

---

## Architecture Overview

```
macOS (user's machine)
│
├── Intentive (Tauri menu bar app)
│   ├── Webview (Settings / Neon Auth)
│   │   └── sign-in → login token to Rust; receives connection mood only (`routing:status`, `get_connection_status` on mount)
│   ├── Rust core
│   │   ├── ScreenPipe subprocess (capture)
│   │   ├── Ollama subprocess (summarization)
│   │   ├── Context Heartbeat (10-minute fixed cadence) → local SQLite log (7-day retention)
│   │   └── Routing domain
│   │       ├── Control Plane `GET /agent` → Routing (`ws_url`, JWT, `agent_instance_id`)
│   │       ├── Routing State (credentials) and Session State (live socket) — independent dials
│   │       └── Protocol WebSocket session (connect + reconnect; emits `context_snapshot` / `session_end_marker`)
│   └── Agent Runtime (always-alive GCE VM) ← WebSocket Protocol
│
├── ScreenPipe CLI binary (bundled)
│   └── HTTP API on localhost:44380
│
└── LLM Provider (resolved at startup)
    ├── Tier 1: Apple Intelligence (ScreenPipe /ai/chat/completions)
    ├── Tier 2: Existing Ollama at localhost:11434
    └── Tier 3: Bundled Ollama + qwen3.5:0.8b (downloaded on first run)
```

## Stack

| Layer           | Choice                                                                                 | Reason                                                                     |
| --------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| App framework   | Tauri 2.x                                                                              | Lightweight, Rust-native, menu bar support, no Chromium                    |
| Frontend        | TypeScript + React                                                                     | Standard Tauri stack                                                       |
| Capture engine  | ScreenPipe CLI binary (bundled)                                                        | Wraps, not reimplements; HTTP API is the boundary                          |
| On-device LLM   | Apple Intelligence → existing Ollama (≤ 5GB on disk) → bundled Ollama + `qwen3.5:0.8b` | Tiered: zero-download when possible, bundled fallback, always on-device    |
| Local storage   | SQLite (via Tauri plugin)                                                              | Snapshot log + future transparency UI                                      |
| Agent transport | WebSocket Protocol (Zod-validated events from `packages/protocol/`)                    | Agent Runtime is always-alive on a GCE VM; same Protocol every client uses |

---

## Context Snapshot Payload

```json
{
  "id": "uuid-v4",
  "captured_at": "2025-01-15T14:32:00Z",
  "period_start": "2025-01-15T14:22:00Z",
  "period_end": "2025-01-15T14:32:00Z",
  "summary": "User spent the 10-minute window in Figma editing a dashboard component, briefly checked Slack, then opened Chrome to review a Notion doc titled 'Q3 Roadmap'."
}
```

Raw ScreenPipe data (OCR text, audio transcript, app/window fields) is consumed internally during summarization. It is not stored in the local log or sent to the agent.

---

## Privacy

- All capture and summarization is on-device
- LLM prompt includes explicit constraints: do not include passwords, credentials, financial data, or personal identifiers
- Local SQLite log stores only the sanitized summary — never raw screen or audio data
- The WebSocket connection to the Agent Runtime is the only network egress during normal operation
- No telemetry in v1

---

## Deferred Decisions

| Decision                                             | Why deferred                                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Snapshot history / transparency UI                   | Snapshot Store is ready; UI is a future phase                                                       |
| Client-side retry queue                              | v1 is at-most-once with reconnect-snapshot recovery; revisit when reliability data shows it matters |
| Approach 2 (embed screenpipe-engine as Rust library) | Only if ScreenPipe HTTP API proves insufficient for a specific gap                                  |
