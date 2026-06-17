# Intentive Desktop Client V1 PRD

> **Canonical vocabulary:** the Desktop Client [`CONTEXT.md`](../../apps/desktop/CONTEXT.md) and the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md). This PRD is the parent scope for related GitHub issues; when they disagree, CONTEXT wins.

## Clarification (aligned May 2026)

User-facing Settings does not expose manual endpoint URL or API key fields. After **Neon Auth** sign-in, the **Desktop Client** obtains **Routing** from **Control Plane** `GET /agent` (`ws_url`, `runtime_jwt`, `agent_instance_id`) and opens a **Protocol** WebSocket to the **Agent Runtime**. **Control Plane** is not on the snapshot data path.

V1 includes real Google sign-in (same identity as mobile). Settings is a minimal account/app surface; the menu bar owns **Capture Session** control. After sign-in and **Desktop Capture Readiness**, capture auto-starts when appropriate.

**No chat UI on Desktop in V1** — capture, summarize, **Snapshot Store**, and Protocol emit only.

## Problem Statement

The **Agent Runtime** needs timely, privacy-respecting context about what the signed-in user is doing on their Mac. Raw screen capture is too sensitive to send remotely; a foreground app would interrupt the user.

The **Desktop Client** is the local infrastructure layer: quietly runs on macOS, manages **ScreenPipe** capture, summarizes on-device, writes **Context Snapshots** to the **Snapshot Store** (local-truth SQLite), and **emits** them as `context_snapshot` events on the shared **Protocol** WebSocket. **Session End Marker** is a distinct event when a **Capture Session** ends.

## Solution

Build Intentive as a macOS-only Tauri 2 background service with a menu bar icon and Settings window. During a **Capture Session**, Intentive manages ScreenPipe, runs a fixed **10-minute Context Heartbeat**, summarizes via **LLM Provider** (Apple Intelligence → existing Ollama → bundled Ollama), writes each sanitized **Context Snapshot** to the **Snapshot Store**, then emits it on the **Protocol** WebSocket to the **Agent Runtime**.

The product stays quiet: start/stop capture from the menu bar; account in Settings; setup/error states only when needed. Raw ScreenPipe data is never stored in the snapshot log or sent on the Protocol.

## User Stories

1. As an end user, I want Intentive in the menu bar, so it is always available without being a foreground app.
2. As an end user, I want no Dock icon, so it feels like a background service.
3. As an end user, I want to start a **Capture Session** from the menu bar when ready.
4. As an end user, I want to stop capture immediately from the menu bar.
5. As an end user, I want the tray icon to show stopped, capturing, and error states.
6. As an end user, I want Start unavailable while already capturing.
7. As an end user, I want Stop unavailable when not capturing.
8. As an end user, I want Quit to stop Intentive-owned ScreenPipe (and related) processes.
9. As an end user, I want first-run setup for required local components (model download when needed).
10. As an end user, I want setup copy to say Intentive, not expose Ollama internals.
11. As an end user, I want visible first-run progress during model download.
12. As an end user, I want subsequent launches to skip completed setup.
13. As an end user, I want to use an existing Ollama instance when present.
14. As an end user, I want clear errors on unresolvable Ollama port conflicts.
15. As an end user, I want on-device summarization so raw capture does not leave my Mac.
16. As an end user, I want summaries to omit passwords, credentials, financial data, and personal identifiers.
17. As an end user, I want quiet operation during capture — fixed 10-minute cadence without interrupting my flow.
18. As an end user, I want capture to continue after a failed emit, so a temporary outage does not break future heartbeats.
19. As an end user, I want Settings closable while capture continues.
20. As an end user, I want Neon Auth sign-in in Settings — not manual agent endpoint fields.
21. As an end user, I want **Capture Permission Setup** guided when grants are missing (Device-Local Gate).
22. As an end user, I want macOS Privacy Settings to show Intentive-owned identity, not ScreenPipe.
23. As an end user, I want a local audit trail of recent **Context Snapshots** in the **Snapshot Store**.
24. As an end user, I want bounded retention (e.g. 7 days), so history does not grow forever.
25. As a developer, I want each snapshot emitted as a `context_snapshot` Protocol event with snapshot_id, captured_at, period_start, period_end, summary.
26. As a developer, I want JWT at WebSocket connect only — not per-event Authorization headers.
27. As a developer, I want `pushed_at` set only on delivery ack; failures leave it null.
28. As a developer, I want at-most-once emit in v1 (no client retry queue); undelivered rows are not retried (each tick emits only its own fresh snapshot, ADR-0005).
29. As a developer, I want `session_end_marker` on capture end with Protocol shape from `packages/protocol/`.
30. As a developer, I want write-to-**Snapshot Store**-before-emit ordering.
31. As a developer, I want ScreenPipe as an internal boundary — bundled CLI, HTTP API, process lifecycle.
32. As a developer, I want deep modules for capture, heartbeat, summarization, snapshot store, and Protocol emit (`agent_interface` Rust module name is internal).

## Implementation Decisions

- Tauri 2: Rust for capture, heartbeat, storage, Protocol emit; React for Settings/Auth UI only.
- macOS Apple Silicon only in V1; menu bar + Settings — **no chat UI**.
- Menu bar agent, no Dock icon; replace starter scaffold UI.
- ScreenPipe: bundled CLI, local HTTP API; no user-visible "ScreenPipe" in Privacy copy.
- **Capture Session** maps to ScreenPipe lifecycle; crash → error state.
- **LLM Provider** priority: Apple Intelligence → existing Ollama → bundled Ollama.
- **Context Heartbeat**: fixed **10-minute** cadence during capture — no activity-gated skip in v1.
- **Context Snapshot** five fields; raw ScreenPipe never in snapshot log or Protocol payload.
- **Snapshot Store**: SQLite local-truth; `pushed_at` on ack only; 7-day purge on launch.
- **Routing** (#11): `GET /agent` after Neon Auth; Protocol WebSocket session to **Agent Runtime**.
- **Emit** (#8): `context_snapshot` and `session_end_marker` on open WebSocket — no legacy HTTP delivery path.
- Settings: Neon Auth UI; no endpoint/API key fields; no ScreenPipe diagnostics to users.
- Auto-start capture when signed in and **Desktop Capture Readiness** confirmed.

## Testing Decisions

- Test external behavior and stable module contracts.
- ScreenPipe supervisor: start/stop/quit/crash/duplicate-start fakes.
- LLM Provider: tier resolution, bundled pull, port conflict — fakes where needed.
- Context Heartbeat: 10-minute cadence, write-before-emit, survival after emit failure.
- Snapshot store: insert, `pushed_at`, retention purge.
- Protocol emit: payload shape, connect JWT, ack/failure, `session_end_marker` — mocked WebSocket or test gateway.
- Settings: auth states, no manual endpoint fields.
- Smoke (#9): signed-in path produces snapshot locally and emits to controlled Protocol endpoint.

## Out of Scope

- Chat UI on Desktop (all conversation on **Mobile Client**).
- Behavioral analysis or coaching inside Intentive.
- **Agent Runtime** reasoning (downstream service).
- Transparency/history UI for snapshots (local store exists; UI later).
- Client-side retry queue for failed emits (v1 at-most-once).
- Windows/Linux; Intel Macs in v1.
- Multiple runtime endpoints or fan-out.
- Raw ScreenPipe in Protocol payloads or snapshot log.
- User-entered agent URL/API key.

## Further Notes

- Glossary: Desktop Client [`CONTEXT.md`](../../apps/desktop/CONTEXT.md) and root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md) — **Agent Runtime**, **Protocol**, **Routing**, **Snapshot Store**, **Context Snapshot**, **Capture Session**, etc.
- Follows repo ADRs: Tauri, ScreenPipe wrap, menu bar-only UI, local snapshot store, at-most-once emit, on-device summarization.
- Open issues implement remaining slices (#7–#16 among open work); closed issues record shipped history unchanged.
