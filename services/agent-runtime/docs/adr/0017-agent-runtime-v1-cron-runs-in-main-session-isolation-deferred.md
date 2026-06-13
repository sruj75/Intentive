# ADR 0017: v1 Cron Runs in the Main Session (Single Brain); Isolated/Custom Cron Sessions Are Deferred

## Status

Accepted

## Date

2026-06-13

## Context

ADR-0015 established monitoring as a **main-session** mechanism (single brain,
ADR-0014). ADR-0016 made the **Per-User Channel** the single run-loop and already
arbitrated a **Cron fire** as "enqueue on the per-user lane, prioritized over
Monitoring Turns." But neither ADR explicitly decided _which session_ a cron job
runs in — and OpenClaw, which we adapt by default (ADR-0001), runs cron jobs in
**isolated** sessions by one common configuration, the opposite of what we chose
for heartbeat. That unforced tension needed a recorded decision.

OpenClaw cron supports three session targets (`cron-llms.txt`):

| Target                     | Mechanism                                                                                                  | OpenClaw uses it for                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Main session** (`main`)  | enqueues a system event into a cron lane, may wake the heartbeat; uses the main session's delivery context | **Reminders, system events**                 |
| **Isolated** (`isolated`)  | dedicated agent turn, **fresh transcript**, inherits **no** conversation context                           | **Reports, background chores**               |
| **Custom** (`session:xxx`) | persistent side-thread across runs                                                                         | recurring jobs that build on prior summaries |

The split is by **purpose**: jobs about the user's life/relationship run in the
main session; heavy self-contained autonomous work runs isolated so it does not
bloat the main transcript.

Every cron job Intentive has in v1 is a **reminder/nudge** — the CONTEXT.md
examples are "ping the user at 9am about the deadline" and "user takes a pill
~9pm → fire a Cron at 9pm." These are squarely OpenClaw's _main-session_ category.

## Decision

**v1 Cron runs in the main session. A Cron fire is a scheduled main-session wake
against the user's one checkpoint, on the Per-User Channel. Isolated/custom cron
sessions are deferred to the first background-chore use case.**

1. **Main-session wake.** A Cron fire behaves like a timer-triggered Monitoring
   Turn: it runs against the user's single checkpoint via the Per-User Channel
   run-loop (ADR-0016), silent-by-default with Post-Message-Back egress
   (ADR-0013). It is grounded in the full relationship context.

2. **Why not isolated.** A reminder firing _blind to the conversation_ — not
   knowing the user already submitted the thesis, or mentioned being sick — is
   exactly the robotic split-brain ADR-0014 rejected; the same argument applies to
   scheduled actions. An isolated cron would also require its own lane/checkpoint
   _outside_ the ADR-0016 run-loop, silently reopening that decision.

3. **Isolation deferred, not denied.** OpenClaw isolates _background chores_
   (heavy autonomous research/reports) — a category v1 lacks. When Intentive grows
   one (e.g. "compile a weekly review"), **isolated cron is the correct tool for
   that job specifically**, added by purpose at that time — mirroring OpenClaw's
   own split rather than reinventing it. Not a v1 default.

4. **Cron still records.** Unlike a Monitoring Turn (which records nothing), a
   Cron fire persists a durable **job/run record** — keeping OpenClaw's "cron
   schedules; tasks record what ran" separation (the scheduled-job row + run
   history).

## Consequences

### Positive

- Consistent with ADR-0014 (single brain), ADR-0015 (main-session monitoring), and
  ADR-0016 (cron already enqueued on the per-user lane) — no contradiction.
- Reminders are context-grounded, the whole point of an exocortex companion.
- Faithful to OpenClaw's purpose-based split; isolation stays available for the
  category that actually needs it.

### Negative

- Cron turns run against (and grow) the main eternal thread — adding to the
  summary-of-summary drift risk (ADR-0011/0012); accepted, Phase 11 retention.
- No cheap "fire-and-forget isolated" cron in v1; any future heavy autonomous job
  must wait for the deferred isolation work.

### Neutral / Follow-up

- The cron job/run-record schema, scheduling precision, overdue-on-restart
  handling, and the self-scheduling `schedule_cron` tool surface are
  implementation details for the `cron` slice.
- When isolated/custom cron is introduced, it gets its own ADR covering its
  separate lane/checkpoint and how its delivery rejoins the main relationship.
