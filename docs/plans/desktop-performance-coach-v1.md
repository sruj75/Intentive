# Desktop Performance Coach V1

## Status

Product decisions are resolved and implementation is in progress. This document,
the current request contract, and ADR-0006 are the implementation source of
truth.

## Outcome

Ship the smallest credible version of Intentive as a human performance coach for
Knowledge Athletes:

> When the User opens their Mac, the Companion welcomes them, helps them choose
> important work, sits alongside the live work using privacy-respecting
> perception, and intervenes only when doing so can help meaningful progress.
> When the User closes or pauses the Mac coaching experience, the Companion steps
> out.

The north-star outcome is **Important Work Yield**: meaningful progress on the
User-declared Important Outcome per intentional work hour. **Focus Endurance**
describes sustaining that quality across more User-chosen working time. Neither
becomes a productivity score or promise of maximum working hours.

## Governing decisions

- Follow the **Human Performance Coach Model**. Agent behavior adapts to context;
  it is not a shell-owned mode machine.
- Desktop-only. No Mobile product path, push delivery, or cross-device coaching.
- Laptop-bound. No 24/7, offline, gym, driving, or capture-independent coaching.
- Text-only Floating Bar. Spoken Companion and camera perception are V2.
- Raw screenshots and audio stay local. Runtime receives privacy-filtered,
  structured recent progression.
- Passive microphone sensing is included after explicit permission and only
  during the Desktop Coaching Window.
- The User can end all perception with one Pause Coaching action.
- Detailed perception expires; only curated Coaching Memory persists.
- Target sustained-drift awareness within two minutes while a Coaching Window is
  active.
- Reuse the existing 3-second-on-power / 9-second-on-battery capture cadence and
  collapsible monitoring lane. Defer a new adaptive agent-cadence system.

System-wide rationale is recorded in
[ADR-0006](../adr/0006-desktop-coaching-window-bounds-v1.md).

## Founder Preview implementation amendment

This amendment is canonical where older phase wording below differs.

- The first ship boundary is a Developer-ID-signed `Intentive Preview.app`
  installed against production services. There is no required dogfood-day count.
- `connect` advertises optional capability `desktop_coaching_v1`.
- The Protocol adds strict `coaching_window_started`,
  `coaching_window_ended`, and non-durable `coaching_window_presence` events.
  Lifecycle reasons and shapes are fixed by ADR-0006 and Protocol fixtures.
- New Desktop perception always carries `window_id`; the field is wire-optional
  only while legacy queued events drain. Windowless events are never Coaching
  Perception.
- `DesktopCoachingWindowCoordinator` is the single lifecycle module above screen
  and passive-audio coordinators. Its observable states are inactive, active,
  locked, and paused; it owns no Work-State Judgment.
- Every onboarding step and live Screen Recording, Microphone, Accessibility,
  and separately exposed System Audio grant is required. There is no optional
  or degraded coaching path.
- V1 exposes one Pause/Resume action instead of normal independent source-enable
  switches. Pause is not persisted: relaunch begins a new eligible window.
- Runtime proactivity requires a durable active window plus a connected Desktop
  attesting the same active `window_id`. Lock and disconnect fail closed without
  creating another orientation.
- Opening Orientation guarantees one visible message per window through a stable
  identity; model attempts may retry. Desktop acknowledges that identity only
  after its final matching-window check and Floating Bar presentation or stable
  deduplication. The first Monitoring floor is anchored to that server-recorded
  completion.
- Monitoring uses a 120-second minimum interval and trailing floor. Recent
  perception is bounded to 32 events and 12,000 rendered characters, with a fixed
  upper cursor and advancement only after a successful turn. Evidence version
  binds the cursor interval to a digest of the exact rendered current projection;
  redaction, tombstone, or expiry during model work invalidates proactive commit.
- The event ledger supplies idempotency and ordering metadata but not retained
  detailed perception. Current projection content is authoritative for expiry,
  tombstone, and redaction.
- Coaching Post-Message-Back routes only to the matching Desktop window. Ordinary
  interactive routing remains unchanged.
- Standard Tracing is accepted for Founder Preview: model-visible filtered text
  may be retained by Langfuse and the model provider, while raw media remains
  local and application telemetry stays content-redacted.

## Founder Preview rollout order

Production rollout is deliberately manual because Runtime deploys do not apply
schema migrations:

1. Disable the push-deploy gate and apply the additive, schema-only Coaching
   Window migration. Validate constraints and legacy chat/perception ingress.
2. Deploy the backward-compatible Runtime with `desktop_coaching_v1` disabled;
   require HTTP 426, both load-balancer backends healthy, and legacy
   session-start/chat/perception smoke.
3. Enable the feature only for the founder account. Verify the production-labeled
   `intentive-runtime-bundle` Procedure Floor prompt containing `SOUL`, `AGENTS`,
   `BOOTSTRAP`, and `HEARTBEAT`, publish the behavioral dataset/eval, and verify one
   synthetic lifecycle-to-intervention trace.
4. After the new projection reader is healthy, run the separate guarded
   perception-ledger cleanup. Its dry run and transaction preflight must prove
   that every eligible historical identity has a current projection before any
   detailed payload is scrubbed. This cleanup is never part of the pre-deploy
   schema migration.
5. Publish and install the Developer-ID-signed `Intentive Preview.app` against
   production, then run lifecycle acceptance and the 60-minute M2 soak.

Emergency rollback disables the Runtime feature first, then reinstalls the prior
Preview or restores the prior Runtime image. The additive schema remains.

## Current capability audit

| Needed capability   | Current substrate                                                                               | V1 gap                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Launch with the Mac | LaunchAgent and deterministic background-launch marker                                          | Background launch stays headless and does not begin a coach welcome           |
| Screen perception   | ScreenCaptureKit, local Vision OCR, Rewind archive, redaction, durable outbox                   | Agent prompt sees only the latest compact summary                             |
| Audio perception    | Local VAD/transcription pipeline, microphone/system-audio coordinators, permissions and toggles | Lifecycle is not owned by one Coaching Window                                 |
| Conversation        | Runtime-owned Conversation History and text Floating Bar                                        | Runtime delivery capability still centers Mobile                              |
| Proactive judgment  | Monitoring Turn, Per-User Channel, DeepAgents, Post-Message-Back                                | Heartbeat is 24/7; prompts are placeholders; no window gate                   |
| Historical context  | `perception_records`, FTS/vector search, retention metadata                                     | Search returns summaries instead of useful matched perception                 |
| Privacy exit        | Per-source toggles, exclusions, retention, clear-all, quit                                      | No single Pause Coaching action                                               |
| Coaching memory     | DeepAgents checkpoint plus Per-User Memory                                                      | No explicit curated-memory policy or eval against verbatim perception copying |
| Release proof       | Desktop harness, Accessibility acceptance, signed bundle, Preview pipeline                      | No end-to-end coaching tracer or coach-quality evaluation                     |

## Scope cuts

Do not build these for V1:

- Mobile UI, Mobile delivery, push notifications, or Mobile onboarding.
- Spoken Companion, realtime voice loop, dictation, camera, facial-state analysis,
  or cloud screenshot vision.
- 24/7 Heartbeat, offline nudges, scheduled coaching, or Cron-originated
  interruptions.
- Automated productivity scores, dashboards, task forms, Pomodoro mechanics, or
  a shell-side drift classifier.
- Concurrent coaching across multiple Macs.
- Keyboard/mouse automation or an agent that performs the User's work.
- A rewrite of Rewind, capture, Runtime, conversation, or Floating Bar modules.

## Delivery strategy

Build one vertical tracer and deepen it phase by phase:

```text
Desktop Coaching Window starts
  → Agent performs Opening Orientation
  → User declares Important Outcome in conversation
  → Desktop supplies recent Coaching Perception
  → Agent stays silent or uses Least Necessary Intervention
  → User pauses or Mac sleeps
  → perception and proactive coaching stop
```

Each phase must leave this tracer more real. Avoid isolated infrastructure phases
that cannot be exercised through the Desktop.

## Phase 0 — Align the contracts

### Work

1. Make this plan, `CONTEXT-MAP.md`, and ADR-0006 canonical for V1.
2. Mark the old Desktop PRD and old Agent Runtime implementation plan as historical
   where they still prescribe capture-only Desktop, Mobile-first chat, or 24/7
   Heartbeat.
3. Update `ARCHITECTURE.md`, `docs/USER-JOURNEY.md`, Desktop/Runtime architecture,
   and affected ADR statuses so they no longer advertise Mobile or offline
   coaching as V1.
4. Add `coaching_window_started` and `coaching_window_ended` to
   `packages/protocol`, with committed fixtures consumed by TypeScript and Swift.
5. Keep `session_end_marker` as capture/archive durability; do not overload it with
   product-presence semantics.
6. Fix the V1 delivery capability contract to `{desktop}` and declare mobile push
   dormant.

### Proof

- Protocol tests reject malformed lifecycle events and accept matching TS/Swift
  fixtures.
- Contract-drift and vocabulary sensors pass.
- No canonical V1 doc requires Mobile, push, voice, camera, or offline Heartbeat.

## Phase 1 — Make the Coaching Window real

### Work

1. Add a Desktop-level Coaching Window lifecycle coordinator above the existing
   screen and passive-audio coordinators. It owns `window_id`, not coaching
   judgment.
2. Begin a window after sign-in, onboarding, and required permissions are ready:
   on normal launch, launch-at-login, wake from system sleep, or explicit Resume.
3. End a window on Pause Coaching, sleep, sign-out, quit, or recovered crash.
   Preserve the window across screen lock while synchronously pausing both
   perception sources.
4. Add Pause/Resume Coaching to the Floating Bar and menu-bar surface. Pause must
   stop screen, microphone, and system audio before returning success.
5. Persist and redeliver lifecycle events through the existing Desktop outbox.
6. In Runtime, ingest lifecycle events through the Per-User Channel and project
   `coaching_windows` with one active window per User. A new start closes stale
   prior state idempotently.
7. Fail closed: disconnect, expiry, or an end event prevents new proactive
   presentation until another accepted start.

### Proof

- Desktop unit tests cover launch, login launch, sleep/wake, lock/unlock,
  pause/resume, quit, crash recovery, duplicate delivery, and permission loss.
- Runtime tests prove lifecycle idempotency, one-active-window enforcement, and
  no proactive turn or delivery without an active window.
- An Accessibility tracer can start, pause, and resume coaching through real UI.

## Phase 2 — Deliver one Desktop coaching conversation

### Work

1. Make Desktop the v1 chat-capable client in the shared Runtime delivery port.
   Remove Mobile foreground/push fallback from the V1 execution path without
   deleting reusable generic code.
2. On an accepted start event, enqueue one main-thread Opening Orientation turn.
   Reconnects, `hello_ok`, presence changes, and duplicate starts must not enqueue
   another.
3. Let the Agent's Post-Message-Back reveal the Floating Bar on login/background
   launch without promoting the whole application or stealing keyboard focus.
4. Preserve ordinary interactive replies in the same Runtime Conversation
   History. Desktop reconnect restores the thread.
5. Present proactive interventions with Floating Bar + subtle edge glow only:
   no macOS notification, Dock bounce, or audio.
6. Tie proactive delivery to `window_id`. A message finishing after its window
   ended or lost active Desktop attestation cannot be committed to Conversation
   History or interrupt a later window. A content-free failed Runtime Turn anchor
   may still record the attempt.

### Proof

- Login launch produces exactly one welcome in the Floating Bar.
- A network reconnect produces zero additional welcomes.
- User text receives a normal reply; a proactive response is visibly distinct
  but uses the same thread.
- Closing/pausing during an in-flight turn produces no stale popup or push.

## Phase 3 — Give the coach useful perception

### Work

1. Keep existing high-frequency local capture, OCR, Rewind, deduplication,
   redaction, and retention behavior.
2. Replace `SensoryBufferReader.readLatest` with a bounded recent-progression
   projection scoped to the active `window_id`. Fix an upper ordering cursor,
   join it to current `perception_records`, and advance the durable window cursor
   only after a successful turn.
3. Bind each evidence version to the included cursor bounds and a SHA-256 digest
   of the exact rendered current projection. Rerender it before proactive commit
   and cursor advancement so mid-turn expiry, tombstones, or redaction re-emits
   invalidate stale output.
4. Render chronological app/window changes, permitted OCR excerpts or deltas,
   focus/activity summaries, and passive-audio summaries. Bound by time, event
   count, and total prompt characters.
5. Use the full permitted `signals` payload; stop discarding it when assembling
   Runtime perception.
6. Upgrade `search_screen_context` to return privacy-safe matched snippets and
   metadata rather than summary-only rows.
7. Ensure expiry and tombstones remove records from both recent injection and
   historical search. Secret-detected content remains structurally absent.
8. Start and stop passive microphone/system-audio sensing with the Coaching
   Window. Replace the normal source switches with the one Pause/Resume boundary.
9. Store only dedupe/ordering metadata for new perception ledger rows. Scrub
   historical detailed bodies only through the guarded post-deploy cleanup after
   projection validation.

### Proof

- A test sequence across several apps/windows reaches the model in order and only
  once across successive turns.
- Full raw media never crosses the Protocol or appears in Runtime logs/traces.
- Expired, tombstoned, excluded-app, and secret-detected content cannot be
  retrieved or injected.
- An M2 MacBook Air can sustain screen OCR plus permitted passive audio without
  unacceptable heat, battery, memory, or UI latency.

## Phase 4 — Install the human performance coach behavior

### Work

1. Replace the Langfuse Procedure Floor placeholders with the resolved
   product behavior:
   - Human Performance Coach Model;
   - Opening Orientation;
   - Important Outcome and multiple Important Work Blocks;
   - Executive-Function Scaffolding;
   - Quiet Presence;
   - revisable Work-State Judgment;
   - Least Necessary Intervention;
   - Important Work Yield and Focus Endurance;
   - user agency and correction.
2. Opening Orientation welcomes naturally, learns what matters now, and helps
   decompose an ambition only when helpful. It never behaves like a task form.
3. During work, the Agent decides among silence, one brief non-assumptive nudge,
   or a deeper recovery conversation. The shell never classifies those outcomes.
4. Let the Companion infer progress from visible artifacts and conversation. It
   asks when meaning is ambiguous; it does not require a closeout ritual.
5. Curate durable Coaching Memory into patterns, preferences, obstacles, and
   effective interventions. Do not automatically copy verbatim OCR/audio content
   into long-term memory.
6. Add Langfuse datasets/evals for opening quality, healthy-flow silence,
   legitimate task switching, drift, blockage, confusion, overwhelm, user
   correction, non-nagging, and memory hygiene.

### Proof

- Scenario evals distinguish healthy progress from drift without a shell
  classifier.
- The Agent accepts correction and updates its judgment without defensiveness.
- Progressing users receive silence; ignored nudges do not repeat from identical
  evidence.
- Memory review contains useful coaching abstractions, not copied work content.

## Phase 5 — Bound the proactive loop

### Work

1. Gate all Monitoring Turn scheduling on an active Coaching Window.
2. Replace the capture-independent flat Heartbeat floor with a simple
   active-window coaching floor. Perception remains the primary trigger; the
   floor catches prolonged stillness or missing perception while the User is
   present.
3. Reuse Desktop's existing 3-second-on-power / 9-second-on-battery capture and
   the Per-User Channel's collapsible perception lane. Apply one simple
   active-window throttle/floor so the system targets a judgment opportunity
   within two minutes without starting one turn per frame or OCR record. Do not
   build a new adaptive cadence engine in V1.
4. Attach `window_id` and the included perception time range to the existing
   Runtime/Langfuse trace metadata for evaluation and stale-delivery suppression.
5. Prevent repeated interventions from unchanged evidence through agent context
   plus deterministic event and turn-range idempotency—not a shell saliency score.
6. Keep Cron and offline Heartbeat machinery dormant for V1. No active window
   means no proactive model call and no proactive delivery.
7. Measure model cost, latency, and token volume per active coaching hour. Tune
   batching and model choice while preserving the under-two-minute target.

### Proof

- A 60-minute representative active-window soak records turn/token cost without
  making a speculative cost budget the Preview gate.
- No monitoring call occurs before a start or after an end.
- Burst perception collapses without losing chronological progression.
- Sustained drift fixtures receive a judgment opportunity within two minutes.
- Healthy-progress fixtures do not generate user-visible interruptions.

## Phase 6 — Prove the product, then dogfood it

### Deterministic verification

1. Protocol package tests and cross-language fixtures.
2. Agent Runtime tests for lifecycle, perception watermarking, turn gating,
   Desktop-only delivery, retention, and stale-window suppression.
3. Desktop Swift tests for coordinated lifecycle, permissions, Pause Coaching,
   Floating Bar presentation, capture, audio, sleep/wake, and crash recovery.
4. Root `pnpm harness`, scoped Desktop/Runtime harnesses, contract-drift sensor,
   and impact-radius report.

### End-to-end acceptance

Add one signed-in Accessibility-driven tracer:

1. Launch Intentive as a login item.
2. Observe one non-focus-stealing welcome.
3. Declare an Important Outcome in the Floating Bar.
4. Perform representative work across several windows.
5. Prove healthy work stays uninterrupted.
6. Inject a drift/blockage fixture and receive one brief useful nudge.
7. Reply and complete the recovery conversation.
8. Pause Coaching and prove both screen and audio stop and no Runtime turn fires.
9. Resume, receive one new orientation, then close the lid/sleep and prove the
   window ends.

### Privacy and performance acceptance

- Clean-TCC proof for Screen Recording, Microphone, and System Audio.
- Raw-media egress guard and secret/excluded-app controls.
- Retention/tombstone/clear-all proof across Desktop and Runtime.
- M2 MacBook Air soak for CPU, battery, memory, thermals, OCR cadence, local STT,
  Runtime cost per coaching hour, and Floating Bar responsiveness.

### Founder Preview

Publish and install the Desktop Preview identity against production systems.
Review the first live tracer in Langfuse and Sentry, then begin ordinary dogfood
use. The implementation milestone is the installed, usable Preview rather than a
fixed number of elapsed days. Continuing evidence should show that the Companion:

- helps establish important work;
- remains quiet during real flow;
- notices useful moments within the target latency;
- gives non-annoying, context-aware interventions;
- remembers patterns without retaining detailed work indefinitely;
- always steps out when paused or the Coaching Window ends.

## Critical path

```text
Phase 0 contracts
  → Phase 1 Coaching Window
  → Phase 2 Desktop conversation
  → Phase 3 rich perception
  → Phase 4 coach behavior
  → Phase 5 proactive bounds
  → Phase 6 acceptance and Preview
```

Procedure Floor authoring and scenario-eval fixture design may begin after Phase
0 in parallel with Phases 1–3, but the coach behavior is not accepted until it
runs on the real lifecycle, perception, and delivery tracer.

## Definition of V1 shipped

The Founder Preview implementation is shipped when a signed Desktop build is
installed on a real M2 MacBook Air against the production Runtime and the live
tracer proves that the Companion arrives, orients, watches privacy-filtered live
work, exercises human-like judgment about when to remain quiet or help, and
leaves immediately when the User pauses or closes the coaching window.

It is not shipped merely because capture, OCR, chat, or an LLM response works in
isolation.
