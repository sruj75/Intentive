## Clarification (May 20, 2026)

The issue sequence has been updated so user-facing Settings no longer exposes manual endpoint URL or API key fields. Intentive still connects to one OpenClaw Agent endpoint per user, but that Agent Interface configuration is resolved behind Auth rather than entered by the user. See #4 and #13.

The completed v1 trajectory should include real Google sign-in using the same Gmail identity associated with the user's OpenClaw Agent. Issue #4 may use temporary sign in/sign up affordances while the Settings shell is built, but placeholder-only Auth is not the final v1 outcome.

Settings is a minimal account and app surface. The menu bar remains the primary Capture Session control. Settings may mirror user-facing Intentive capture state, but it should not expose ScreenPipe diagnostics or developer-style Agent Interface configuration.

After a user signs in and Intentive has resolved Agent Interface configuration, Intentive should start capturing automatically.

## Problem Statement

OpenClaw Agent needs timely, privacy-respecting context about what the signed-in user is doing on their Mac. Today, the OpenClaw Agent is effectively blind unless the user manually explains their current activity. Raw screen capture is too sensitive to send to a remote agent, and a foreground app would interrupt the user while they are working.

Intentive should become the local infrastructure layer that quietly runs on macOS, manages capture and local summarization, produces Context Snapshots from recent activity, and pushes those snapshots to the OpenClaw Agent through the Agent Interface. The current repository is still a Tauri starter scaffold, so the v1 work is to turn that scaffold into the menu bar background service described by the existing specification, glossary, design notes, and ADRs.

## Solution

Build Intentive as a macOS-only Tauri 2 background service with a menu bar icon and settings window. During a Capture Session, Intentive manages ScreenPipe as the local capture process, observes meaningful activity through ScreenPipe's local APIs, runs a 60-second Context Heartbeat, summarizes recent activity on-device through a bundled or detected Ollama instance, writes each sanitized Context Snapshot to local SQLite, and then pushes the snapshot JSON to the configured OpenClaw Agent endpoint over HTTPS.

The user-facing product remains intentionally quiet. Users start and stop capture from the menu bar, configure auth and Agent Interface settings from the settings window, and see setup or error states only when needed. Raw ScreenPipe data is consumed internally and is never stored in Intentive's snapshot log or sent to the OpenClaw Agent.

## User Stories

1. As an end user, I want Intentive to live in the macOS menu bar, so that it is always available without becoming a foreground app.
2. As an end user, I want Intentive to avoid showing a Dock icon, so that it feels like a background service rather than another app I must manage.
3. As an end user, I want to start a Capture Session from the menu bar, so that Intentive begins feeding context to my OpenClaw Agent when I choose.
4. As an end user, I want to stop a Capture Session from the menu bar, so that recording and snapshot delivery stop immediately.
5. As an end user, I want the menu bar icon to show stopped, capturing, and error states, so that I can understand Intentive's state at a glance.
6. As an end user, I want Start to be unavailable while a Capture Session is already active, so that I cannot accidentally start duplicate capture processes.
7. As an end user, I want Stop to be unavailable when no Capture Session is active, so that the menu reflects the real state of Intentive.
8. As an end user, I want quitting Intentive to stop ScreenPipe and Ollama processes owned by Intentive, so that background recording does not continue unexpectedly.
9. As an end user, I want Intentive to set up required local components on first launch, so that I do not have to manually install ScreenPipe or Ollama.
10. As an end user, I want first-run setup copy to refer to Intentive setup rather than Ollama internals, so that implementation details stay hidden.
11. As an end user, I want first-run setup progress to be visible, so that a model download does not look like a frozen app.
12. As an end user, I want subsequent launches to skip completed first-run setup, so that Intentive becomes fast and quiet after installation.
13. As an end user, I want Intentive to use an existing Ollama instance when one is already running, so that it does not create unnecessary duplicate services.
14. As an end user, I want Intentive to detect an unresolved Ollama port conflict, so that I can see why local summarization is unavailable.
15. As an end user, I want my computer activity summarized on-device, so that raw screen, audio, OCR, and UI event data do not leave my Mac.
16. As an end user, I want Context Snapshots to exclude passwords, credentials, financial data, and personal identifiers, so that the OpenClaw Agent receives only safe working context.
17. As an end user, I want Intentive to keep working silently during a Capture Session, so that it does not interrupt my flow every 60 seconds.
18. As an end user, I want Intentive to skip idle windows, so that my OpenClaw Agent does not receive empty or misleading Context Snapshots.
19. As an end user, I want Intentive to continue after a failed push, so that a temporary network or OpenClaw Agent outage does not break future Context Heartbeats.
20. As an end user, I want the settings window to be closable while capture continues, so that configuration is separate from the Capture Session lifecycle.
21. As an end user, I want endpoint URL and API key settings to persist across restarts, so that I do not have to reconfigure Intentive every time.
22. As an end user, I want a placeholder sign in / sign up surface in settings, so that the v1 UI has a home for Auth even while the provider decision is deferred.
23. As an end user, I want to see ScreenPipe status in settings, so that I can diagnose capture readiness without reading logs.
24. As an end user, I want a capture toggle in settings, so that I can control Capture Session state from the same place I configure Intentive.
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
36. As an agent builder, I want the Context Heartbeat to run every 60 seconds during a Capture Session, so that context delivery has a predictable cadence.
37. As an agent builder, I want the Context Heartbeat to be activity-gated by ScreenPipe events, so that the OpenClaw Agent receives snapshots only when something meaningful changed.
38. As an agent builder, I want ScreenPipe treated as the named capture boundary, so that Intentive does not couple itself to ScreenPipe's internal SQLite unless the HTTP API cannot serve a need.
39. As an agent builder, I want Intentive to bundle the ScreenPipe CLI binary, so that setup is controlled by Intentive rather than manual user installation.
40. As an agent builder, I want Intentive to manage ScreenPipe process lifecycle, so that Capture Session state maps to a real running or stopped ScreenPipe process.
41. As an agent builder, I want ScreenPipe crash detection, so that the menu bar status can enter an error state when capture is no longer reliable.
42. As an agent builder, I want Intentive to bundle or detect Ollama, so that local summarization has one standard execution path.
43. As an agent builder, I want the local model choice verified before implementation, so that first-run setup does not pull a nonexistent model tag.
44. As an agent builder, I want snapshot writes to happen before push attempts, so that local audit state exists even when network delivery fails.
45. As an agent builder, I want snapshots older than 7 days purged on launch, so that retention is bounded by default.
46. As an agent builder, I want Auth deferred behind a stable placeholder, so that the rest of v1 can ship before the OpenClaw Agent backend identity decision is final.
47. As an agent builder, I want the configured endpoint to be one OpenClaw Agent endpoint per user in v1, so that fan-out and multi-agent delivery do not complicate the first implementation.
48. As a developer, I want the starter React UI removed or replaced, so that no Tauri template behavior leaks into Intentive.
49. As a developer, I want Tauri commands and Rust modules organized around Intentive domain concepts, so that subprocess, heartbeat, storage, and Agent Interface behavior can be tested independently.
50. As a developer, I want deep modules around process lifecycle, snapshot generation, local persistence, and push delivery, so that each boundary has a small stable interface and meaningful tests.

## Implementation Decisions

- Intentive remains a Tauri 2 application using Rust for native process, storage, and menu bar responsibilities, and TypeScript + React for settings and setup UI.
- Intentive is macOS-only for v1.
- The v1 UI is menu bar plus settings window only. There is no persistent main window, AI chat UI, or history/transparency UI in this PRD.
- The app should be configured as a menu bar agent with no Dock icon.
- The existing Tauri/Vite starter UI and greet command are scaffolding and should be replaced by Intentive-specific surfaces and commands.
- ScreenPipe is integrated by bundling and spawning the ScreenPipe CLI binary. Intentive wraps ScreenPipe and communicates over ScreenPipe's local HTTP and WebSocket APIs.
- ScreenPipe's HTTP API on localhost:3030 is the primary integration boundary. Intentive does not read ScreenPipe's SQLite database directly unless the API proves insufficient for a specific need.
- Capture Session state is owned by Intentive and maps to ScreenPipe process lifecycle: start spawns or attaches as needed, stop kills the child process owned by Intentive, and quit stops capture.
- ScreenPipe crash or unexpected exit moves Intentive into an error state visible from the menu bar and settings.
- Ollama is the v1 local summarization mechanism. Intentive should detect and use an already running Ollama instance when possible, or spawn its bundled Ollama binary when needed.
- Intentive owns summarization readiness around localhost:11434 and must detect unresolvable port conflicts.
- First-run setup pulls the chosen local model and presents progress as Intentive setup, not as an exposed Ollama configuration screen.
- The model tag must be resolved before implementation. Current docs conflict between `llama3.2:1b` first-run prose and `qwen3.5:0.8b` model consequences/spec references.
- The Context Heartbeat is an internal service that runs every 60 seconds only during a Capture Session.
- The Context Heartbeat uses ScreenPipe WebSocket activity signals to decide whether meaningful activity has occurred since the previous snapshot.
- If no meaningful activity occurred, the Context Heartbeat skips the cycle silently.
- If activity occurred, the Context Heartbeat queries ScreenPipe's local HTTP API for the preceding activity window.
- The summarization prompt must instruct the local model to omit passwords, credentials, financial data, and personal identifiers.
- A Context Snapshot contains id, captured_at, period_start, period_end, and summary.
- Raw ScreenPipe OCR, audio transcript, app/window fields, and UI events are internal summarization inputs only. They are not persisted in Intentive's local snapshot log and are not sent through the Agent Interface.
- Intentive writes each Context Snapshot to a local SQLite snapshots table before attempting to push it.
- The local snapshots table stores id, captured_at, period_start, period_end, summary, and nullable pushed_at.
- Snapshot retention is 7 days. Entries older than 7 days are purged automatically on launch.
- The Agent Interface is HTTPS POST to the configured OpenClaw Agent endpoint.
- The OpenClaw Agent is event-driven and wakes when a Context Snapshot arrives. Pull and polling from the OpenClaw Agent are out of scope.
- The push request includes JSON payload fields id, captured_at, period_start, period_end, and summary.
- The push request includes an Authorization header containing the configured API key.
- Push success updates pushed_at locally.
- Push failure from network error, timeout, or non-2xx response does not crash or stall the Context Heartbeat. The failed snapshot is dropped for v1 and pushed_at remains null.
- Settings persist endpoint URL and API key across app restarts.
- The settings window includes placeholder Auth controls for sign in / sign up, but provider-backed Auth is deferred.
- The settings window includes ScreenPipe status and a Capture Session toggle.
- Auto-start on login, native repeated failure notifications, and model warm-up are nice-to-have follow-on enhancements, not required for the first PRD implementation.
- The main deep modules to build are: menu bar application shell, settings and setup UI, ScreenPipe process manager, Ollama process/model manager, Context Heartbeat, summarization prompt runner, local snapshot store, Agent Interface push client, app configuration store, and lifecycle/state coordinator.

## Testing Decisions

- Tests should assert external behavior and stable module contracts, not private implementation details.
- ScreenPipe process manager tests should cover start, stop, quit cleanup, crash/error transition, and duplicate start prevention using a fake child-process boundary.
- Ollama manager tests should cover existing-instance detection, spawned-instance readiness, model-present skip, first-run pull flow, and port conflict error behavior using fake HTTP/process boundaries.
- Context Heartbeat tests should cover 60-second cadence decisions, activity-gated skip behavior, activity-window construction, summarization invocation, local write-before-push ordering, and survival after push failure.
- Summarization tests should verify prompt constraints and output handling without depending on a real local model in ordinary unit tests.
- Snapshot store tests should cover schema creation, inserting snapshots, marking pushed_at, leaving pushed_at null on failure, and 7-day retention purge.
- Agent Interface tests should cover JSON payload shape, Authorization header, success handling, non-2xx handling, timeout handling, and network error handling against a local fake server or mocked HTTP client.
- Settings/config tests should cover persisted endpoint URL and API key, reload across restarts, and missing/invalid configuration behavior.
- UI tests should cover user-visible state transitions for stopped, capturing, setup, and error states without asserting CSS implementation details.
- End-to-end or manual smoke coverage should prove that a Capture Session can start, produce at least one fake or local Context Snapshot, write it locally, and attempt a push to a controlled test endpoint.
- Build verification should include the standard TypeScript/Vite build and Rust/Tauri checks available in the repository.

## Out of Scope

- Behavioral analysis, goal comparison, coaching, or decision-making inside Intentive.
- OpenClaw Agent reasoning behavior.
- Transparency/history UI for reviewing recent Context Snapshots.
- Persist-and-retry or replay of failed snapshot pushes.
- Windows and Linux support.
- Full Auth provider integration.
- Multiple OpenClaw Agent endpoints or fan-out.
- AI chat UI inside Intentive.
- Direct embedding of `screenpipe-engine` as a Rust library, unless ScreenPipe's HTTP API proves insufficient for a specific v1 requirement.
- Sending raw ScreenPipe data to the OpenClaw Agent.
- Storing raw ScreenPipe data in Intentive's local snapshot log.

## Further Notes

- Use the glossary in CONTEXT.md exactly: Intentive, ScreenPipe, Capture Session, Context Snapshot, Context Heartbeat, OpenClaw Agent, Agent Interface, and Auth.
- The PRD intentionally follows the ADR decisions already present in the repo: Tauri over Electron, ScreenPipe CLI wrapping, menu bar-only v1 UI, push-based Agent Interface, dropping failed pushes in v1, Ollama for on-device summarization, and local snapshot storage with retention.
- The repository currently contains Tauri starter code, so implementation should begin by replacing template UI/commands with Intentive domain surfaces and then building the native service modules behind them.
- Confirm the final Ollama model tag before coding first-run setup. The current documents contain a model-name inconsistency that should be resolved before implementation begins.

