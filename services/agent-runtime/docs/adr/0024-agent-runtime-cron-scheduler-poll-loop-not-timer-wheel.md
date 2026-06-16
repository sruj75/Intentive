# ADR 0024: Cron Scheduler Is a Poll Loop, Not a Timer Wheel

## Status

Accepted

## Date

2026-06-15

## Context

Issue #39 adds **Cron** — the primitive that lets the Companion set itself a future
alarm ("ping the user at 9am about the deadline"). On fire a Cron _wakes and thinks_
a turn; it does not auto-notify (egress is Post-Message-Back, ADR-0013, shipped by
#41). The open question is the **scheduler shape**: how does an always-alive,
multi-tenant process decide which jobs are due and fire them?

Bedrock facts:

- **We are multi-tenant and always-alive.** One GCE process serves every user; jobs
  for all users live in Neon (`user_id`-scoped). The scheduler must answer "which
  jobs, across all users, are due right now?"
- **The VM restarts.** Deploys, crashes, and host maintenance mean the process dies
  and comes back. Any fire that came due _while it was down_ must not be silently lost
  — acceptance criterion #6 requires missed/late-fire behavior to be documented and
  tested.
- **Two battle-tested references diverge.** OpenClaw _production_ persists a
  `nextRunAtMs` per job and reconciles on boot. The build-your-own-openclaw tutorial
  is simpler still: `CronWorker.run()` is `while True: tick(); sleep(60)`, and each
  tick asks `croniter.match(schedule, now_minute)` — pure stateless minute-matching,
  no stored cursor. The tutorial loses any fire that occurs during downtime (the
  matching minute never returns), which fails our criterion #6.

So we want the tutorial's dead-simple loop **and** production's missed-fire safety.

## Decision

**The scheduler is a poll loop over Neon — `tick(); sleep(60)` — that queries for
jobs whose persisted `next_fire_at <= now()`. There is no in-memory timer wheel and
no per-minute schedule re-matching.**

1. **One process-wide poll loop.** A single shell-owned loop wakes every ~60s, runs
   one `tick()`, and sleeps. `tick()` issues one query: due jobs across all users
   (`WHERE next_fire_at <= now()`), ordered, bounded by a batch limit.

2. **Each job persists its own `next_fire_at`.** On create and after every fire, the
   shell computes the next instant with **croner** (from the job's `at`/`every`/`cron`
   schedule + resolved timezone) and writes it onto the cron card. The `cron_jobs`
   column is the single source of truth for "when next," not an in-memory structure.

3. **Restart-survival and missed fires fall out of the same query.** Because due-ness
   is `next_fire_at <= now()`, anything that came due during downtime is simply found
   on the **first tick after boot** and fired — no boot-time reconciliation pass, no
   rebuilt timer wheel. A job is never "missed"; at worst it fires late by up to the
   poll interval plus downtime.

4. **Firing is selected by the poll loop and run by the cron fire handler.** A due job
   does not mutate the user's main checkpoint in the issue #39 slice. It runs a silent
   ephemeral cron turn, records `cron_runs`, and applies lifecycle/retry updates. The
   poll loop is still bounded by batch size and does not maintain per-job timers.

5. **Overdue is handled gently, not stampeded.** After firing, recurring jobs recompute
   `next_fire_at` _forward from now_ (catch-up fires are coalesced to one, not replayed
   per missed interval); one-shots auto-delete. The poll loop's batch size bounds
   issue #39 Cron bursts; ADR-0016 bounds main-thread Monitoring Turn bursts.

## Considered Options

- **In-memory timer wheel / `setTimeout` per job.** Rejected: precise to the second but
  loses all state on restart (must be rebuilt from Neon on boot anyway), and holding
  every user's timers in memory fights the lazy-hydration/idle-eviction model (ADR-0018).
  The poll loop makes restart a non-event.
- **Stateless per-minute matching (the tutorial's `croniter.match(now_minute)`).**
  Rejected: elegant for a single-user laptop bot, but a fire that should happen during
  downtime is lost forever because that minute never recurs — fails acceptance
  criterion #6.
- **Per-user scheduler threads.** Rejected: thousands of loops where one suffices;
  cross-user "what's due" becomes a fan-out instead of one indexed query.

## Consequences

### Positive

- Restart-survival and missed-fire handling are **free** — one query expresses both.
- Dead-simple to reason about and test: it's a query plus a clock.
- No in-memory scheduling state to rebuild, lose, or keep consistent with Neon.
- Cross-user due-selection is one indexed scan, aligning with multi-tenant Neon.

### Negative

- Fire granularity is bounded by the poll interval (~60s late at worst) — fine for
  human reminders, unsuitable for sub-minute precision (which v1 does not need; the
  5-min minimum-interval floor makes it irrelevant).
- A periodic query runs even when nothing is due — cheap with an index on
  `next_fire_at`, and the cost is constant regardless of user count.

### Neutral / Follow-up

- The exact poll interval and batch size are implementation/tuning details, not fixed
  here. The implementation uses a real partial index on `cron_jobs(next_fire_at) WHERE
status = 'active'`.
- OpenClaw's auto-stagger jitter (spreading top-of-hour recurring jobs by up to 5 min)
  is a separate thundering-herd refinement, deferred; the 5-min minimum-interval floor
  (a frequency guard, distinct from jitter) ships in v1.
- Storage of the cron card itself is ADR-0026 (filesystem card fronting the
  purpose-built `cron_jobs` table); this ADR only fixes _how the loop finds and fires_
  due cards.

## Related

- ADR-0016 (Per-User Channel run-loop; cron trigger arbitration, skip-when-busy)
- ADR-0017 (historical main-session leaning; issue #39 fires on an ephemeral thread)
- ADR-0018 (instance lifecycle: lazy hydration, idle eviction; always-running scheduler)
- ADR-0025 (device-reported timezone resolved at fire time for `next_fire_at`)
- ADR-0026 (cron is a DeepAgents-native filesystem card; no bespoke tools)
- `CONTEXT.md` — Cron term
