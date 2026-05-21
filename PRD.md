## Problem Statement

OpenClaw Agent needs timely, privacy-respecting context about what the signed-in user is doing on their Mac. Today, the OpenClaw Agent is effectively blind unless the user manually explains their current activity. Raw screen capture is too sensitive to send to a remote agent, and a foreground app would interrupt the user while they are working.

Intentive should become the local infrastructure layer that quietly runs on macOS, manages capture and local summarization, produces Context Snapshots from recent activity, and pushes those snapshots to the OpenClaw Agent through the Agent Interface. The current repository is still a Tauri starter scaffold, so the v1 work is to turn that scaffold into the menu bar background service described by the existing specification, glossary, design notes, and ADRs.

## Solution

Build Intentive as an Apple Silicon macOS Tauri 2 background service with a menu bar icon and settings window. A Capture Session starts automatically when a signed-in user launches Intentive. During a Capture Session, Intentive manages ScreenPipe as the local capture process, runs a fixed 10-minute Context Heartbeat, summarizes recent activity on-device through a bundled or detected Ollama instance, writes each sanitized Context Snapshot to local SQLite, and then pushes the snapshot JSON to the configured OpenClaw Agent endpoint over HTTPS.

The user-facing product remains intentionally quiet. Capture starts on launch and runs in the background; users can stop and restart it from the menu bar. Auth includes an explicit consent step before account creation. Raw ScreenPipe data is consumed internally and is never stored in Intentive's snapshot log or sent to the OpenClaw Agent.

## User Stories

1. As an end user, I want Intentive to live in the macOS menu bar, so that it is always available without becoming a foreground app.
2. As an end user, I want Intentive to avoid showing a Dock icon, so that it feels like a background service rather than another app I must manage.
3. As an end user, I want Intentive to automatically start a Capture Session when I launch it signed in, so that context is always being captured without me thinking about it.
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
16. As an end user, I want Context Snapshots to exclude passwords, credentials, financial data, and personal identifiers, so that the OpenClaw Agent receives only safe working context.
17. As an end user, I want Intentive to keep working silently during a Capture Session, so that it does not interrupt my flow every 10 minutes.
19. As an end user, I want Intentive to continue after a failed push, so that a temporary network or OpenClaw Agent outage does not break future Context Heartbeats.
20. As an end user, I want the settings window to be closable while capture continues, so that configuration is separate from the Capture Session lifecycle.
21. As an end user, I want signing in to connect Intentive to my OpenClaw Agent automatically, so that I do not have to manage endpoint URLs or API keys.
22. As an end user, I want the sign-in flow to include a consent step before my account is created, so that I explicitly agree to Intentive capturing my activity before it begins.
22b. As an end user, I want the Settings window to show the Neon Auth sign-in/account surface, so that identity is handled in one familiar place.
23. As an end user, I want Settings to avoid internal diagnostics, so that Intentive feels like a product rather than a developer configuration panel.
24. As an end user, I want Settings to mirror simple Intentive status when useful, while the menu bar remains the primary Capture Session control.
25. As an end user, I want Intentive to retain a local record of recent Context Snapshots, so that a future transparency UI can show what was captured and sent.
26. As an end user, I want local snapshot retention to be limited, so that Intentive does not accumulate an indefinite activity history.
27. As an agent builder, I want Intentive to push Context Snapshots to the OpenClaw Agent, so that the OpenClaw Agent wakes up when new activity context exists.
28. As an agent builder, I want the Agent Interface to be HTTPS POST, so that the OpenClaw Agent can receive snapshots from the user's Mac over the network.
29. As an agent builder, I want every Context Snapshot to include a unique id, so that I can deduplicate snapshots.
30. As an agent builder, I want every Context Snapshot to include captured_at, period_start, and period_end timestamps, so that I can order and reason about activity windows.
31. As an agent builder, I want Context Snapshot summaries to be coherent prose, so that they can be appended to the OpenClaw Agent's context without further transformation.
32. As an agent builder, I want the payload to exclude raw ScreenPipe data, so that the Agent Interface stays privacy-preserving and token-efficient.
33. As an agent builder, I want each request to include an Authorization header, so that the OpenClaw Agent can reject unauthorized snapshot pushes.
34. As an agent builder, I want failed pushes to leave pushed_at null locally, so that delivery state remains inspectable.
35. As an agent builder, I want failed pushes to be dropped in v1, so that Intentive avoids retry queue complexity while the infrastructure path is validated.
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
46. As an agent builder, I want Neon Auth to be the v1 identity foundation, so that Intentive and the OpenClaw Agent can share a database-backed user identity.
47. As an agent builder, I want the configured endpoint to be one OpenClaw Agent endpoint per user in v1, so that fan-out and multi-agent delivery do not complicate the first implementation.
48. As a developer, I want the starter React UI removed or replaced, so that no Tauri template behavior leaks into Intentive.
49. As a developer, I want Tauri commands and Rust modules organized around Intentive domain concepts, so that subprocess, heartbeat, storage, and Agent Interface behavior can be tested independently.
50. As a developer, I want deep modules around process lifecycle, snapshot generation, local persistence, and push delivery, so that each boundary has a small stable interface and meaningful tests.

## Implementation Decisions

- Intentive remains a Tauri 2 application using Rust for native process, storage, and menu bar responsibilities, and TypeScript + React for settings and setup UI.
- Intentive is macOS-only for v1, on **Apple Silicon (M-series) Macs only**; Intel Macs and dual-arch packaging are deferred (ADR-0014).
- The v1 UI is menu bar plus settings window only. There is no persistent main window, AI chat UI, or history/transparency UI in this PRD.
- The app should be configured as a menu bar agent with no Dock icon.
- The existing Tauri/Vite starter UI and greet command are scaffolding and should be replaced by Intentive-specific surfaces and commands.
- ScreenPipe is integrated by bundling and spawning the ScreenPipe CLI binary. Intentive wraps ScreenPipe and communicates over ScreenPipe's local HTTP and WebSocket APIs.
- ScreenPipe's HTTP API on localhost:44380 is the primary integration boundary for the Intentive-owned bundled process. Intentive does not read ScreenPipe's SQLite database directly unless the API proves insufficient for a specific need.
- A Capture Session starts automatically when a signed-in user launches Intentive. Intentive does not capture without a signed-in user. The menu bar toggle stops (or restarts) capture manually; there is no separate start action on launch. See ADR-0009.
- Capture Session state is owned by Intentive and maps to ScreenPipe process lifecycle: auto-start on signed-in launch spawns ScreenPipe, stop kills the child process owned by Intentive, and quit stops capture cleanly.
- ScreenPipe crash or unexpected exit triggers one silent retry; a second unexpected exit moves Intentive into an error state visible from the menu bar and settings.
- The **LLM Provider** resolves at startup in priority order (see ADR-0006): (1) Apple Intelligence via ScreenPipe `/ai/status` and `/ai/chat/completions`, (2) existing Ollama at `localhost:11434` — use the loaded model or the first installed model ≤ 5GB on disk, fall through to Tier 3 if none qualify, (3) bundled Ollama with `qwen3.5:0.8b` pulled on first run.
- Intentive owns summarization readiness around ScreenPipe (`localhost:44380` for the bundled process), existing Ollama (`localhost:11434`), and bundled Ollama (`localhost:44381`) and must detect unresolvable port conflicts for bundled paths.
- First-run setup pulls `qwen3.5:0.8b` only when Tier 3 is needed (including Tier 2 fallthrough) and presents progress as Intentive setup, not as an exposed Ollama configuration screen.
- **Locked (issue #2):** Tier 3 model tag is `qwen3.5:0.8b` (verified in Ollama registry). Agent Interface payload is exactly five JSON fields (`id`, `captured_at`, `period_start`, `period_end`, `summary`) with `Authorization: Bearer` and a 10-second push timeout; see `src-tauri/src/agent_interface/` and SPEC.md **Resolved**.
- The Context Heartbeat is an internal service that runs on a fixed 10-minute cadence during a Capture Session. It always fires — there is no activity-gated skipping. See ADR-0008.
- On each tick, the Context Heartbeat queries ScreenPipe's local HTTP API for the preceding 10-minute activity window and produces a Context Snapshot regardless of how much state changed.
- When a Capture Session ends for any reason (user toggle, quit, or ScreenPipe crash), the Context Heartbeat sends a Session End Marker before shutting down.
- The summarization prompt must instruct the local model to omit passwords, credentials, financial data, and personal identifiers.
- A Context Snapshot contains id, captured_at, period_start, period_end, and summary.
- Raw ScreenPipe OCR, audio transcript, app/window fields, and UI events are internal summarization inputs only. They are not persisted in Intentive's local snapshot log and are not sent through the Agent Interface.
- Intentive writes each Context Snapshot to a local SQLite snapshots table before attempting to push it.
- The local snapshots table stores id, captured_at, period_start, period_end, summary, and nullable pushed_at.
- Snapshot retention is 7 days. Entries older than 7 days are purged automatically on launch.
- The Agent Interface is HTTPS POST to the Auth-resolved OpenClaw Agent endpoint.
- The OpenClaw Agent is event-driven and wakes when a Context Snapshot arrives. Pull and polling from the OpenClaw Agent are out of scope.
- The push request includes JSON payload fields id, captured_at, period_start, period_end, and summary. Session End Marker payload shape is deferred until the OpenClaw Agent contract is defined.
- The push request includes an Authorization header containing the Auth-resolved credential.
- Push success updates pushed_at locally.
- Push failure from network error, timeout, or non-2xx response does not crash or stall the Context Heartbeat. The failed snapshot is dropped for v1 and pushed_at remains null.
- Settings uses Neon Auth UI for sign-in/account controls, with Google as the intended OAuth provider.
- Settings does not expose endpoint URL, API key, ScreenPipe diagnostics, or internal Agent Interface configuration.
- Auth-resolved Agent Interface configuration is internal: a signed-in Neon user resolves one OpenClaw Agent endpoint and credential for push delivery.
- Auto-start on login, native repeated failure notifications, and model warm-up are nice-to-have follow-on enhancements, not required for the first PRD implementation.
- The main deep modules to build are: menu bar application shell, settings and setup UI, ScreenPipe process manager, Ollama process/model manager, Context Heartbeat, summarization prompt runner, local snapshot store, Agent Interface push client, app configuration store, and lifecycle/state coordinator.

## Testing Decisions

- Tests should assert external behavior and stable module contracts, not private implementation details.
- ScreenPipe process manager tests should cover start, stop, quit cleanup, crash/error transition, and duplicate start prevention using a fake child-process boundary.
- Ollama manager tests should cover existing-instance detection, spawned-instance readiness, model-present skip, first-run pull flow, and port conflict error behavior using fake HTTP/process boundaries.
- Context Heartbeat tests should cover 10-minute fixed cadence firing, activity-window construction, summarization invocation, local write-before-push ordering, Session End Marker emission on session stop/quit/crash, and survival after push failure.
- Summarization tests should verify prompt constraints and output handling without depending on a real local model in ordinary unit tests.
- Snapshot store tests should cover schema creation, inserting snapshots, marking pushed_at, leaving pushed_at null on failure, and 7-day retention purge.
- Agent Interface tests should cover JSON payload shape, Authorization header, success handling, non-2xx handling, timeout handling, and network error handling against a local fake server or mocked HTTP client.
- Settings/Auth tests should cover Neon Auth UI rendering, missing `VITE_NEON_AUTH_URL`, absence of manual endpoint/API key fields, and missing/invalid Auth-resolved configuration behavior.
- UI tests should cover user-visible state transitions for stopped, capturing, setup, and error states without asserting CSS implementation details.
- End-to-end or manual smoke coverage should prove that a Capture Session can start, produce at least one fake or local Context Snapshot, write it locally, and attempt a push to a controlled test endpoint.
- Build verification should include the standard TypeScript/Vite build and Rust/Tauri checks available in the repository.

## Out of Scope

- Behavioral analysis, goal comparison, coaching, or decision-making inside Intentive.
- OpenClaw Agent reasoning behavior.
- Transparency/history UI for reviewing recent Context Snapshots.
- Persist-and-retry or replay of failed snapshot pushes.
- Windows and Linux support.
- Alternative Auth provider integration.
- Multiple OpenClaw Agent endpoints or fan-out.
- AI chat UI inside Intentive.
- Direct embedding of `screenpipe-engine` as a Rust library, unless ScreenPipe's HTTP API proves insufficient for a specific v1 requirement.
- Sending raw ScreenPipe data to the OpenClaw Agent.
- Storing raw ScreenPipe data in Intentive's local snapshot log.

## Further Notes

- Use the glossary in CONTEXT.md exactly: Intentive, ScreenPipe, Capture Session, Context Snapshot, Context Heartbeat, OpenClaw Agent, Agent Interface, and Auth.
- The PRD intentionally follows the ADR decisions already present in the repo: Tauri over Electron, ScreenPipe CLI wrapping, menu bar-only v1 UI, push-based Agent Interface, dropping failed pushes in v1, Ollama for on-device summarization, and local snapshot storage with retention.
- The repository has replaced the starter React UI with an Intentive Settings/Auth surface and early Rust modules (`capture_session`, `capture_state`, `menu_bar`, `llm_provider`, `agent_interface`). Remaining v1 work wires Context Heartbeat, snapshot storage, and Auth-resolved Agent Interface configuration behind the locked contracts above.
