## Problem Statement

Agent Runtime needs timely, privacy-respecting context about what the signed-in user is doing on their Mac. Today, the Agent Runtime is effectively blind unless the user manually explains their current activity. Raw screen capture is too sensitive to send to a remote agent, and a foreground app would interrupt the user while they are working.

Intentive should become the local infrastructure layer that quietly runs on macOS, manages capture and local summarization, produces Context Snapshots from recent activity, and emits those snapshots to the Agent Runtime as `context_snapshot` events on the shared WebSocket Protocol (see `packages/protocol/`). The current repository is still a Tauri starter scaffold, so the v1 work is to turn that scaffold into the menu bar background service described by the existing specification, glossary, design notes, and ADRs.

## Solution

Build the Intentive Desktop Client as an Apple Silicon macOS Tauri 2 background service with a menu bar icon and settings window. A Capture Session starts automatically when a signed-in user launches it and the Control Plane confirms Desktop Capture Readiness for that registered Mac. During a Capture Session, the Desktop Client manages ScreenPipe as the local capture process, runs a fixed 10-minute Context Heartbeat, summarizes recent activity on-device through the resolved on-device LLM Provider, writes each sanitized Context Snapshot to the local Snapshot Store, and emits each snapshot as a `context_snapshot` event over the WebSocket connection to the Agent Runtime issued by the Control Plane.

The user-facing product remains intentionally quiet. Capture starts on launch and runs in the background once Auth and Control Plane-confirmed Desktop Capture Readiness are complete; users can stop and restart it from the menu bar. Shared sign-in and onboarding may occur in either client, while Capture Permission Setup gathers Mac-specific capture consent and guides the user through macOS Privacy Settings with curated screenshots and live permission checks. Raw ScreenPipe data is consumed internally and is never stored in Intentive's snapshot log or sent to the Agent Runtime.

## User Stories

1. As an end user, I want Intentive to live in the macOS menu bar, so that it is always available without becoming a foreground app.
2. As an end user, I want Intentive to avoid showing a Dock icon, so that it feels like a background service rather than another app I must manage.
3. As an end user, I want the Desktop Client to automatically start a Capture Session when I launch it after this Mac is desktop capture-ready, so that context is available without me thinking about it.
4. As an end user, I want to stop a Capture Session from the menu bar, so that recording and snapshot delivery stop immediately when I choose.
5. As an end user, I want the menu bar icon to show stopped, capturing, and error states at a glance, so that I can understand Intentive's state without opening anything.
6. As an end user, I want the menu to reflect whether I am capturing or stopped, so that the toggle label always matches the current state.
7. As an end user, I want quitting Intentive to stop the Capture Session cleanly, so that background recording does not continue unexpectedly.
8. As an end user, I want quitting Intentive to stop ScreenPipe and Ollama processes owned by Intentive, so that background recording does not continue unexpectedly.
9. As an end user, I want Intentive to set up required local components on first launch, so that I do not have to manually install ScreenPipe or Ollama.
10. As an end user, I want first-run setup copy to refer to Intentive setup rather than Ollama internals, so that implementation details stay hidden.
11. As an end user, I want first-run setup progress to be visible, so that a model download does not look like a frozen app.
12. As an end user, I want subsequent launches to skip completed first-run setup, so that Intentive becomes fast and quiet after installation.
13. As an end user, I want Intentive to use an existing Ollama instance when one is already running, so that it does not create unnecessary duplicate services.
14. As an end user, I want Intentive to detect an unresolved Ollama port conflict, so that I can see why local summarization is unavailable.
15. As an end user, I want my computer activity summarized on-device, so that raw screen, audio, OCR, and UI event data do not leave my Mac.
16. As an end user, I want Context Snapshots to exclude passwords, credentials, financial data, and personal identifiers, so that the Agent Runtime receives only safe working context.
17. As an end user, I want Intentive to keep working silently during a Capture Session, so that it does not interrupt my flow every 10 minutes.
19. As an end user, I want Intentive to continue after a failed `context_snapshot` delivery, so that a temporary network or Agent Runtime outage does not break future Context Heartbeats.
20. As an end user, I want the settings window to be closable while capture continues, so that configuration is separate from the Capture Session lifecycle.
21. As an end user, I want signing in to connect Intentive to my Agent Runtime automatically, so that I do not have to manage endpoint URLs or API keys.
22. As an end user, I want Capture Permission Setup on my Mac to include desktop capture consent, so that mobile sign-in or onboarding never authorizes Mac screen recording silently.
22b. As an end user, I want the Settings window to show the Neon Auth sign-in/account surface, so that identity is handled in one familiar place.
22c. As an end user, I want Capture Permission Setup to guide me through macOS Privacy Settings step by step with clear screenshots, so that I can grant required capture permissions without guessing.
22d. As an end user, I want macOS Privacy Settings to show Intentive, not ScreenPipe or a debug path, so that I can trust the product requesting capture permissions.
23. As an end user, I want Settings to avoid internal diagnostics, so that Intentive feels like a product rather than a developer configuration panel.
24. As an end user, I want Settings to mirror simple Intentive status when useful, while the menu bar remains the primary Capture Session control.
25. As an end user, I want Intentive to retain a local record of recent Context Snapshots, so that a future transparency UI can show what was captured and sent.
26. As an end user, I want local snapshot retention to be limited, so that Intentive does not accumulate an indefinite activity history.
27. As an agent builder, I want Intentive to deliver Context Snapshots to the Agent Runtime as inbound `context_snapshot` events on the shared WebSocket Protocol, so that desktop activity reaches the runtime through the same unified channel every client uses.
28. As an agent builder, I want the snapshot path to reuse the existing WebSocket handshake, idempotency, ordering, and reconnect semantics defined in `packages/protocol/`, so that no parallel ingress is invented for desktop activity.
29. As an agent builder, I want every Context Snapshot to include a unique id, so that I can deduplicate snapshots.
30. As an agent builder, I want every Context Snapshot to include captured_at, period_start, and period_end timestamps, so that I can order and reason about activity windows.
31. As an agent builder, I want Context Snapshot summaries to be coherent prose, so that they can be appended to the Agent Runtime's context without further transformation.
32. As an agent builder, I want the event payload to exclude raw ScreenPipe data, so that the Protocol stays privacy-preserving and token-efficient.
33. As an agent builder, I want each WebSocket connection authenticated by the Control Plane-issued JWT on the `connect` handshake (not per event), so that the Agent Runtime can reject unauthorized clients without per-message auth overhead.
34. As an agent builder, I want unacknowledged snapshot deliveries to leave `pushed_at` null in the local Snapshot Store, so that delivery state remains inspectable.
35. As an agent builder, I want delivery to be at-most-once in v1 with reconnect-snapshot recovery (per Protocol semantics), so that Intentive avoids a retry queue while the foundation is validated.
36. As an agent builder, I want the Context Heartbeat to run every 10 minutes during a Capture Session, so that context delivery has a predictable cadence.
37. As an agent builder, I want a Session End Marker sent when a Capture Session ends, so that I can distinguish "user still active" from "user stopped or quit." (Payload shape deferred — see ADR-0008.)
38. As an agent builder, I want ScreenPipe treated as the named capture boundary, so that Intentive does not couple itself to ScreenPipe's internal SQLite unless the HTTP API cannot serve a need.
39. As an agent builder, I want Intentive to bundle the ScreenPipe CLI binary, so that setup is controlled by Intentive rather than manual user installation.
40. As an agent builder, I want Intentive to manage ScreenPipe process lifecycle, so that Capture Session state maps to a real running or stopped ScreenPipe process.
41. As an agent builder, I want ScreenPipe crash detection, so that the menu bar status can enter an error state when capture is no longer reliable.
42. As an agent builder, I want Intentive to bundle or detect Ollama, so that local summarization has one standard execution path.
43. As an agent builder, I want the bundled local model tag locked to `qwen3.5:0.8b`, so that first-run setup does not pull a nonexistent model.
44. As an agent builder, I want snapshot writes to happen before push attempts, so that local audit state exists even when network delivery fails.
45. As an agent builder, I want snapshots older than 7 days purged on launch, so that retention is bounded by default.
46. As an agent builder, I want Neon Auth to be the v1 identity foundation, so that Intentive, Control Plane, and Agent Runtime can share one User identity verified independently via Neon Auth JWKS.
47. As an agent builder, I want the Agent Runtime URL and JWT issued by Control Plane's `GET /agent` (Routing), so that the client never decides identity routing and the Control Plane is the single authority for it.
48. As a developer, I want the starter React UI removed or replaced, so that no Tauri template behavior leaks into Intentive.
49. As a developer, I want Tauri commands and Rust modules organized around Intentive domain concepts, so that subprocess, heartbeat, storage, and Protocol-emitter behavior can be tested independently.
50. As a developer, I want deep modules around process lifecycle, snapshot generation, local persistence, and push delivery, so that each boundary has a small stable interface and meaningful tests.

## Implementation Decisions

- Intentive remains a Tauri 2 application using Rust for native process, storage, and menu bar responsibilities, and TypeScript + React for settings and setup UI.
- Intentive is macOS-only for v1, on **Apple Silicon (M-series) Macs only**; Intel Macs and dual-arch packaging are deferred (ADR-0014).
- Intentive v1 ships as a Developer ID signed and notarized Apple Silicon DMG containing only `Intentive.app`; product name is **Intentive** and bundle identifier is `com.heyintentive.tauri` (ADR-0015).
- The v1 UI is menu bar plus settings window only. There is no persistent main window, AI chat UI, or history/transparency UI in this PRD.
- The app should be configured as a menu bar agent with no Dock icon.
- The existing Tauri/Vite starter UI and greet command are scaffolding and should be replaced by Intentive-specific surfaces and commands.
- ScreenPipe is integrated by bundling and spawning the ScreenPipe CLI binary. Intentive wraps ScreenPipe and communicates over ScreenPipe's local HTTP and WebSocket APIs.
- ScreenPipe's HTTP API on localhost:44380 is the primary integration boundary for the Intentive-owned bundled process. Intentive does not read ScreenPipe's SQLite database directly unless the API proves insufficient for a specific need.
- A Capture Session starts automatically when a signed-in user launches the Desktop Client and the Control Plane confirms Desktop Capture Readiness for that registered Mac. A mobile sign-in or onboarding flow cannot grant desktop capture readiness. The menu bar toggle stops (or restarts) capture manually; there is no separate start action on launch. See ADR-0009 and ADR-0015.
- Capture Permission Setup requires Screen & System Audio Recording, Microphone, and Accessibility. It uses static bundled instructional screenshots in the style of Opal, opens the relevant macOS Privacy Settings pane when possible, waits for live OS grant checks, and exposes a Recheck action.
- macOS Privacy Settings must show **Intentive** as the permission owner, with **Intentive Capture** as the only acceptable fallback helper identity. ScreenPipe, lowercase `intentive`, raw helper names, and debug paths are release blockers.
- Local Capture Session execution maps to ScreenPipe process lifecycle in the Desktop Client, while permission to start comes from Control Plane-confirmed Desktop Capture Readiness: auto-start on an eligible launch spawns ScreenPipe, stop kills the child process owned by Intentive, and quit stops capture cleanly.
- ScreenPipe crash or unexpected exit triggers one silent retry; a second unexpected exit moves Intentive into an error state visible from the menu bar and settings.
- The **LLM Provider** resolves at startup in priority order (see ADR-0006): (1) Apple Intelligence via ScreenPipe `/ai/status` and `/ai/chat/completions`, (2) existing Ollama at `localhost:11434` — use the loaded model or the first installed model ≤ 5GB on disk, fall through to Tier 3 if none qualify, (3) bundled Ollama with `qwen3.5:0.8b` pulled on first run.
- Intentive owns summarization readiness around ScreenPipe (`localhost:44380` primary, `localhost:44382` fallback for the bundled process), existing Ollama (`localhost:11434`), and bundled Ollama (`localhost:44381` primary, `localhost:44383` fallback) and must detect unresolvable port conflicts for bundled paths.
- First-run setup pulls `qwen3.5:0.8b` only when Tier 3 is needed (including Tier 2 fallthrough) and presents progress as Intentive setup, not as an exposed Ollama configuration screen.
- **Locked (issue #2):** Tier 3 model tag is `qwen3.5:0.8b` (verified in Ollama registry). The `context_snapshot` event payload is exactly five JSON fields (`id`, `captured_at`, `period_start`, `period_end`, `summary`); JWT authentication happens once on WebSocket `connect`, not per event; see `packages/protocol/`, `src-tauri/src/agent_interface/` (Rust module name retained internally), and SPEC.md **Resolved**.
- The Context Heartbeat is an internal service that runs on a fixed 10-minute cadence during a Capture Session. It always fires — there is no activity-gated skipping. See ADR-0008.
- On each tick, the Context Heartbeat queries ScreenPipe's local HTTP API for the preceding 10-minute activity window and produces a Context Snapshot regardless of how much state changed.
- When a Capture Session ends for any reason (user toggle, quit, or ScreenPipe crash), the Context Heartbeat sends a Session End Marker before shutting down.
- The summarization prompt must instruct the local model to omit passwords, credentials, financial data, and personal identifiers.
- A Context Snapshot contains id, captured_at, period_start, period_end, and summary.
- Raw ScreenPipe OCR, audio transcript, app/window fields, and UI events are internal summarization inputs only. They are not persisted in the Snapshot Store and are not sent over the Protocol.
- Intentive writes each Context Snapshot to a local SQLite snapshots table before attempting to push it.
- The local snapshots table stores id, captured_at, period_start, period_end, summary, and nullable pushed_at.
- Snapshot retention is 7 days. Entries older than 7 days are purged automatically on launch.
- Context Snapshots are emitted as `context_snapshot` events on the WebSocket Protocol. The Agent Runtime URL and JWT come from Control Plane's `GET /agent` (Routing).
- The Agent Runtime is always-alive and processes each `context_snapshot` event as it arrives over the open WebSocket. The Control Plane is not on the data path.
- The event payload includes `id`, `captured_at`, `period_start`, `period_end`, and `summary`. The `session_end_marker` event marks Capture Session termination; its payload shape is deferred until the Agent Runtime contract for it is defined.
- Authentication happens once at WebSocket `connect`: the client presents the Control Plane-issued JWT, the Agent Runtime verifies it locally via Neon Auth JWKS. There is no per-event Authorization header.
- A successful `delivery_ack` from the Agent Runtime stamps `pushed_at` in the local Snapshot Store.
- A dropped connection, timeout, or rejected event does not crash or stall the Context Heartbeat. The local snapshot stays in the Snapshot Store with `pushed_at = null`; recovery in v1 is at-most-once with reconnect snapshot — no client-side retry queue.
- Settings uses Neon Auth UI for sign-in/account controls, with Google as the intended OAuth provider.
- Settings does not expose endpoint URLs, API keys, ScreenPipe diagnostics, or internal Protocol/Routing configuration.
- Routing is resolved internally: a signed-in user calls Control Plane's `GET /agent`, which returns the Agent Runtime URL and a short-lived JWT. The Desktop Client opens the WebSocket directly using that routing.
- Auto-start on login, native repeated failure notifications, and model warm-up are nice-to-have follow-on enhancements, not required for the first PRD implementation.
- The main deep modules to build are: menu bar application shell, settings and setup UI, ScreenPipe process manager, Ollama process/model manager, Context Heartbeat, summarization prompt runner, Snapshot Store, Protocol WebSocket client (`context_snapshot` / `session_end_marker` emitter), app configuration store, and lifecycle/state coordinator.

## Testing Decisions

- Tests should assert external behavior and stable module contracts, not private implementation details.
- ScreenPipe process manager tests should cover start, stop, quit cleanup, crash/error transition, and duplicate start prevention using a fake child-process boundary.
- Ollama manager tests should cover existing-instance detection, spawned-instance readiness, model-present skip, first-run pull flow, and port conflict error behavior using fake HTTP/process boundaries.
- Context Heartbeat tests should cover 10-minute fixed cadence firing, activity-window construction, summarization invocation, local write-before-push ordering, Session End Marker emission on session stop/quit/crash, and survival after push failure.
- Summarization tests should verify prompt constraints and output handling without depending on a real local model in ordinary unit tests.
- Snapshot store tests should cover schema creation, inserting snapshots, marking pushed_at, leaving pushed_at null on failure, and 7-day retention purge.
- Protocol WebSocket client tests should cover `context_snapshot` and `session_end_marker` event payload shape, `connect` handshake with the Control Plane-issued JWT, `delivery_ack` handling, connection-drop behavior (snapshot remains in Snapshot Store with `pushed_at = null`), and reconnect against a local fake gateway or mocked WebSocket.
- Settings/Auth tests should cover Neon Auth UI rendering, missing `VITE_NEON_AUTH_URL`, absence of manual endpoint/API key fields, and missing/invalid Auth-resolved configuration behavior.
- UI tests should cover user-visible state transitions for stopped, capturing, setup, and error states without asserting CSS implementation details.
- End-to-end or manual smoke coverage should prove that a Capture Session can start, produce at least one fake or local Context Snapshot, write it locally, and attempt a push to a controlled test endpoint.
- Build verification should include the standard TypeScript/Vite build and Rust/Tauri checks available in the repository.

## Out of Scope

- Behavioral analysis, goal comparison, coaching, or decision-making inside Intentive.
- Agent Runtime reasoning behavior.
- Transparency/history UI for reviewing recent Context Snapshots.
- Persist-and-retry or replay of failed snapshot pushes.
- Windows and Linux support.
- Alternative Auth provider integration.
- Multiple Agent Instances per user or runtime fan-out.
- AI chat UI inside Intentive.
- Direct embedding of `screenpipe-engine` as a Rust library, unless ScreenPipe's HTTP API proves insufficient for a specific v1 requirement.
- Sending raw ScreenPipe data to the Agent Runtime.
- Storing raw ScreenPipe data in Intentive's local snapshot log.

## Further Notes

- Use the canonical glossary in `docs/CONTEXT.md` at the repo root: Intentive, Companion, ScreenPipe, Capture Session, Context Snapshot, Context Heartbeat, Snapshot Store, Agent Runtime, Protocol, Session End Marker, Routing, Push Notification, Post-Message-Back, Pre-Chat Gate (and its sub-kinds). The deployable-local term "Agent Interface" — when it appears in older Tauri code — refers to the internal Rust module that emits Protocol events; the wire concept is the Protocol.
- The PRD intentionally follows the ADR decisions already present in the repo: Tauri over Electron, ScreenPipe CLI wrapping, menu bar-only v1 UI, snapshot delivery over the shared WebSocket Protocol (no separate HTTP intake), at-most-once delivery in v1 with reconnect-snapshot recovery, Ollama for on-device summarization, and the Snapshot Store with retention.
- The repository has replaced the starter React UI with an Intentive Settings/Auth surface and early Rust modules (`capture_session`, `capture_state`, `screenpipe_supervisor`, `menu_bar`, `llm_provider`, `agent_interface`). Remaining v1 work wires Context Heartbeat, the Snapshot Store, and Control Plane-issued Routing for the WebSocket Protocol connection behind the locked contracts above.
