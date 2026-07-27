# ADR 0006: Desktop Coaching Window Bounds the V1 Product

## Status

Accepted.

## Date

2026-07-26

## Context

Intentive already contains most of the substrate for an always-available Companion:
macOS screen capture and local Vision OCR, Rewind, passive local audio sensing,
the shared Protocol, an always-alive Agent Runtime, one durable Companion
conversation, a text Floating Bar, and Post-Message-Back presentation.

The existing architecture assembled those pieces around a different product:
Mobile was the primary chat surface, Heartbeat ran without a connected Desktop,
Post-Message-Back could become mobile push, and each Monitoring Turn received only
the latest compact perception summary. That does not match the newly resolved v1.

V1 product behavior is modeled on a human performance coach sitting beside a
Knowledge Athlete while live work happens. The Companion welcomes the User,
scaffolds an Important Outcome, quietly observes the work, uses contextual judgment
to decide whether help would be valuable, and begins with the least necessary
intervention. It is present only while the User is working from their Mac.

## Decision

### The product is Desktop-only and window-bound

- The **Desktop Client** is the only v1 coaching, conversation, perception, and
  intervention surface. Mobile code may remain in the monorepo but is outside the
  v1 product and acceptance path.
- A durable **Desktop Coaching Window** is the shell-owned presence boundary. It
  is lifecycle truth, not an agent mode or work-state classifier.
- Add shared Protocol events:
  - `coaching_window_started { window_id, started_at, reason }`
  - `coaching_window_ended { window_id, ended_at, reason }`
  - non-durable
    `coaching_window_presence { window_id, state, changed_at }`
- The Desktop Preview advertises the optional `desktop_coaching_v1` capability
  during `connect`. Legacy Clients remain valid.
- New Desktop-produced `perception_event` records carry `window_id`. The wire
  field remains optional only so already-queued legacy events can be accepted
  and acknowledged; legacy records are never injected into a Coaching Turn.
- V1 permits one active Coaching Window per User. A newly accepted start closes
  any stale prior window. Concurrent multi-Mac coaching is deferred.
- A window begins only after authentication, every onboarding step, and live
  Screen Recording, Microphone, Accessibility, and separately exposed System
  Audio authorization are ready. There is no reduced chat-only or partial-sensing
  coaching path. Normal launch-at-login and wake from system sleep begin a new
  window.
- System sleep, Pause Coaching, sign-out, quit, or crash ends the window. Screen
  lock pauses screen and audio perception but preserves the window; unlock resumes
  quietly without another opening.
- Pause is process-scoped rather than persisted. A later process launch begins a
  fresh eligible window. Revoking any required grant ends the current window;
  restoring the final missing grant begins another.
- The existing `session_end_marker` remains the capture/archive durability fact.
  Coaching Window lifecycle is a distinct product-presence contract.

### The Agent Runtime stays deployed but does not coach outside the window

- The multi-tenant Agent Runtime remains always deployed for durable state,
  authentication, reconnects, and Conversation History.
- Proactive Monitoring Turns, Opening Orientation, and Post-Message-Back delivery
  are permitted only for the User's active Coaching Window.
- A start event triggers exactly one user-visible Opening Orientation in the main
  Companion thread. Attempts may retry behind a stable message identity, but
  WebSocket reconnect, `hello_ok`, foreground changes, and unlock do not create
  another visible orientation.
- Opening Orientation is complete only after the matching Desktop has passed its
  final MainActor window check, projected the message into the live transcript,
  presented (or deduplicated) the Floating Bar effect, and acknowledged the
  stable message identity. Socket receipt alone is not an acknowledgement. The
  first 120-second Monitoring floor begins from this server-recorded completion,
  not the Client-reported window start time.
- Proactive work requires both the durable active window and a live Desktop socket
  attesting that the same window is active. Disconnect and lock fail closed
  without durably ending the window. The Runtime revalidates both facts before a
  proactive message is committed and again before delivery.
- An end event cancels or invalidates pending best-effort monitoring work. A turn
  that finishes after its window closes may retain a content-free failed Runtime
  Turn anchor, but cannot commit a proactive Conversation row or present to the
  User.
- V1 has no capture-independent Heartbeat coaching, mobile push, offline coaching,
  or Cron-originated interruption. Existing generic machinery may remain dormant.
- Desktop becomes the v1 chat-capable delivery kind. A proactive message streams
  to the connected Desktop and reveals the Floating Bar without stealing focus;
  it never falls back to mobile push or a macOS notification.

### Coaching behavior belongs to the Companion

- Opening Orientation, Quiet Presence, Work-State Judgment, executive-function
  scaffolding, and Least Necessary Intervention are Procedure Floor behavior in
  the single Agent Runtime brain.
- The Desktop and Runtime shell provide lifecycle, evidence, serialization, and
  delivery. They never classify drift, mental state, importance, or intervention
  saliency.
- Important Outcomes and transitions between Important Work Blocks are established
  conversationally and carried by the Companion context, not by a task form or a
  shell-owned productivity state machine.

### Perception approximates what the human coach can observe

- Raw screenshots, video, microphone audio, and system audio stay on the Mac.
- With explicit permission, passive audio sensing starts and stops with the
  Coaching Window. It is perception; spoken Companion conversation is deferred.
- The Runtime receives privacy-filtered structured perception across recent work
  progression, including permitted app/window/OCR and filtered audio summaries.
  A single 24-word latest summary is not sufficient.
- Recent perception is bounded by time, count, and prompt budget. A fixed upper
  cursor and the last successfully included ledger position prevent events that
  arrive during model execution from being skipped. Ordering comes from the
  ledger, while model-visible content is joined from the mutable perception
  projection so expiry, tombstones, and redaction re-emits are authoritative.
  Evidence identity binds the included cursor bounds to a digest of the exact
  rendered current projection. The Runtime rerenders and compares that identity
  before proactive commit and successful cursor advancement, so a redaction,
  tombstone, or expiry during model work invalidates the stale result.
  Detailed perception is not copied verbatim into long-term memory automatically.
- New ledger rows keep only idempotency and ordering metadata after projection;
  historical detailed perception payloads are scrubbed only by a guarded
  post-deploy cleanup after the new projection reader is healthy. The cleanup
  aborts unless every eligible ledger identity has a current projection; it is
  not part of the additive pre-deploy schema migration.
- While a Coaching Window is active, the system targets evaluating sustained
  drift or blockage within two minutes. V1 reuses Desktop's existing smart
  3-second-on-power / 9-second-on-battery local capture cadence and the Runtime's
  collapsible perception-triggered Monitoring Turn lane; it does not add a new
  adaptive cadence subsystem. The Agent still decides whether to remain silent.

### The User can ask the coach to step out

- One **Pause Coaching** action ends the window and synchronously stops screen,
  microphone, and system-audio perception.
- Only an explicit User action can resume and begin another window.
- The normal v1 surface does not expose independent source-enable switches.
  Exclusions, retention, and clear-all remain available.

### Standard tracing is an explicit Founder Preview tradeoff

- Raw screenshots, video, microphone audio, and system audio never leave the Mac.
- Sentry, PostHog, and structured logs remain content-redacted.
- The privacy-filtered text rendered into a model prompt may appear in Langfuse
  and at the model provider under their current retention defaults.
- Perception expiry removes content from future Runtime retrieval. It does not
  retroactively erase opaque checkpoints, prior model output, provider records,
  or Langfuse traces.

## Consequences

### Positive

- V1 has one coherent tracer: open Mac → welcome → choose important work → observe
  live work → remain quiet or coach → pause/close.
- Existing capture, perception, runtime, conversation, and presentation modules
  are reused rather than replaced.
- Agent judgment remains flexible and human-like while lifecycle and privacy are
  deterministic.
- Raw-media locality and an immediate user-owned exit make the always-present coach
  legible and reversible.

### Negative

- The shared Protocol, Desktop lifecycle, Runtime scheduler, delivery capability,
  and prompt assembly must change together.
- Under-two-minute reasoning can be expensive; bounded batching, collapse, and
  eval-driven model selection are required.
- A richer recent-perception sequence increases prompt size and privacy exposure
  relative to the current latest-summary path.
- Concurrent Macs, mobile continuity, spoken coaching, camera perception, and
  offline reminders are deliberately absent.

### Superseded or amended assumptions

- Agent Runtime ADR-0018: Heartbeat is no longer a capture-independent v1 product
  engine.
- Agent Runtime ADR-0023: recent perception is no longer exactly one latest item,
  and the idle/away regime does not coach in v1.
- Agent Runtime ADR-0027: the flat forever Heartbeat floor is outside the v1
  product path.
- Agent Runtime ADR-0028: v1 delivery capability is Desktop stream only; no mobile
  push fallback.
- Desktop ADR-0011: a background login launch must start the Coaching Window and
  present the Floating Bar greeting even though it remains a menu-bar application.
- Desktop ADR-0012: amended separately so Pause Coaching ends the whole window
  without restoring a persistent global Private Mode.

### Founder Preview ship boundary

V1 implementation reaches its first ship boundary when a Developer-ID-signed
`Intentive Preview.app` is installed and usable against production services. A
fixed number of dogfood days is not an implementation gate; behavioral learning
begins from that installed build. Public notarized-DMG distribution remains a
later Production gate.

## Related

- `CONTEXT-MAP.md`
- `apps/desktop/CONTEXT.md`
- `services/agent-runtime/CONTEXT.md`
- `docs/adr/0005-perception-event-protocol-evolution.md`
- `apps/desktop/docs/adr/0012-privacy-controls-without-global-private-mode.md`
- `services/agent-runtime/docs/adr/0014-agent-runtime-single-unified-brain-shell-is-senses-and-hands.md`
- `services/agent-runtime/docs/adr/0023-agent-runtime-perception-driven-cadence-two-regimes.md`
