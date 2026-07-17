# ADR 0035: Event-Driven Min-Heap Scheduler — Replaces the 60s Poll Loops

## Status

Accepted

## Date

2026-07-17

## Context

The Agent Runtime is one always-alive GCE VM (ADR-0032). It drives two offline
triggers — **Cron** (ADR-0024) and **Heartbeat** (ADR-0027) — each with its own
.every-60s, forever, regardless of whether anything is due. Neon is the
durable source of truth; on every tick each loop issues a real `SELECT`.

Neon's free-tier compute has a 5-minute `suspend_timeout_seconds` (plan-locked).
The two poll loops query more often than every 5 minutes, so the primary compute
never reaches an idle gap long enough to autosuspend. Confirmed against Neon
directly: the compute has stayed `active` continuously since deploy with zero
suspends. The polling alone burns ~180 CU-hours/month — already ~80% over the
100 CU-hour free-tier allowance — before a single real user query. With zero
production users today and a goal of staying on the free tier through early
traction (~10 users), this is the dominant cost driver and the easiest to fix
at its root.

First-principles: the scheduling question is **"when is the next thing due —
wake exactly then"**, not **"ask Postgres every 60s whether anything's due
yet."** This is standard job-queue design (Bull / Sidekiq / Temporal all separate
the durable source of truth from an in-memory wake mechanism). It is also
compatible with the two governing ADRs, read closely:

- **ADR-0024** ("cron = poll loop, not timer wheel") rejected "in-memory timer
  wheel / `setTimeout` per job" for two reasons: (a) state loss on restart, and
  (b) it "fights the lazy-hydration/idle-eviction model (ADR-0018)." Reason (a)
  is solved by **rebuilding the in-memory structure from Neon on boot** — Neon
  stays the durable source of truth, unchanged. Reason (b) is an imprecise
  conflation: **ADR-0018 itself**, the governing ADR, point 4, explicitly says
  the one process-wide scheduler *should* hold "every user's cron due-times …
  and heartbeat cadence" in memory, and lists "scheduler precision, and the
  timer-wheel storage" as implementation details deferred to these slices. The
  "resident brain" ADR-0018 protects against lazy-hydration is the heavy
  DeepAgents/LangGraph session state — a completely different, much heavier
  thing than a `{ key, dueAt }` heap entry. That stays lazily hydrated,
  unchanged.
- **ADR-0027** ("heartbeat zero stored state") is preserved: Neon remains the
  source of truth for "when did this user last act"; we add **no persisted
  `next_fire_at` column** for heartbeat. The in-memory heap is a rebuildable
  cache, not new durable state.
- Both ADRs explicitly leave the poll interval / wake mechanism as "tunable" /
  "implementation detail, not fixed here."

A new ADR is warranted because the wake mechanism was previously fixed (0024
named the poll loop as *the* design) and a future reader must see that this
_narrows_ the rejected option's reasoning without contradicting the governing
principles.

## Decision

Replace both poll loops with a single **`SchedulerClock`** utility — one
in-memory sorted structure of `{ key, dueAt, kind }` entries, holding exactly
**one** live `setTimeout` set to fire at the earliest entry's `dueAt`. Both
`cron-scheduler.ts` and `heartbeat-scheduler.ts` are rewritten to drive their
own `SchedulerClock` instance.

1. **One clock per domain.** `cronClock` (keyed by `cron_jobs.id`, value the
   row) and `heartbeatClock` (keyed by `user_id`) each hold a min-ordered set of
   due entries and exactly one dynamic timer. `schedule(key, dueAt)` re-arms the
   timer to the new earliest; `cancel(key)` removes an entry. Fire pops all
   entries due `<= now`, invokes an `onDue(entries)` callback, then re-arms.

2. **Neon stays the durable source of truth; boot rebuilds the heap.** On boot,
   one query per domain populates the heap:
   - Cron: `SELECT … WHERE status='active'` (the existing partial index serves
     it) — unordered, **unbounded**.
   - Heartbeat: the same `agent_instances ⟕ runtime_turns` shape as today's
     `selectDue`, but **unbounded** — compute `dueAt = COALESCE(last_turn_at,
     created_at) + floorMs` per user. This mirrors the old "first tick after
     boot catches anything missed during downtime"; restart-survival is
     unchanged.

3. **Write-path hooks are the core change.** Instead of recomputing due-ness by
   polling, each durable mutation that moves a `next_fire_at` (cron) or a "last
   activity" anchor (heartbeat) pushes the new due-time into the heap **from the
   write side, after the transaction commits**:
   - **Turn Execution spine** (`turn.ts`, the single choke point all triggers
     pass through): after the `runtime_turns` anchor transaction commits (ok
     **or** failed — both record an anchor that updates last-activity), the
     spine invokes an injected `onTurnCommitted(userId)`; the composition root
     schedules `heartbeatClock.schedule(userId, now + floorMs)`.
   - **Cron authoring** (`cron-backend.ts` `write()`): after the upsert commits,
     `cronClock.schedule(id, nextFireAt)` if active, else `cronClock.cancel(id)`
     for a cancelled card.
   - **Cron post-fire** (`cron-turn.ts`): after the reschedule/delete
     transaction commits, `cronClock.schedule(id, newNextFireAt)` or
     `cronClock.cancel(id)` — the lifecycle decision is factored into one pure
     helper used by both the SQL-batching path and the hook, so the heap always
     mirrors what was just committed.
   - **New-user bootstrap** (`instance-registry.ts` `loadOrCreate`): when the
     upsert is a genuine INSERT (new user), invoke an injected `onNewUser(userId)`;
     the composition root schedules the first heartbeat. Returning users are left
     untouched (a connect does not change last activity).

4. **Resilience backstop.** One coarse periodic resync re-runs the boot query
   and reconciles the heap against Neon, defaulting to **every 30 minutes**. This
   is a correctness safety net in case a future bug misses a hook — not the
   primary mechanism. 30 minutes is long enough that Neon still gets idle gaps
   long enough to autosuspend (the 5-minute `suspend_timeout_seconds` is well
   inside the gap), and it bounds the blast radius of any future hook-wiring
   mistake to "at most 30 minutes of missed proactivity," an acceptable tradeoff.
   Reconciliation overwrites from DB and cancels stale heap keys, so an
   in-flight turn whose hook runs later simply re-overwrites with the committed
   value — the DB remains authoritative.

5. **Non-negotiables carried forward unchanged:**
   - Single VM only (ADR-0032) — no distributed coordination; an in-memory heap
     is safe precisely because there is exactly one process.
   - A crash/restart loses zero data and self-heals (the heap rebuilds from
     Neon exactly like today's "first tick after boot").
   - Heartbeat has zero _persisted_ new state, a flat 60-min floor, and no
     shell-side dormancy / care judgment (ADR-0014 / 0027) — this replaces _how
     the shell knows when to check_, not what it decides when it checks.
   - Cron still requires the agent-authored `/crons/*.md` flow (ADR-0026) — no
     new tools.

## Net Effect

Between real events, Neon receives **zero scheduler-driven queries**. It is
touched only when: (a) the resync backstop fires (every 30 min), (b) something
is actually due and fires a turn (which was always going to touch Neon anyway),
or (c) a user creates/edits a cron job or connects for the first time. At
10-user scale Neon keeps an idle-suspend gap almost all the time — back inside
the free tier.

## Consequences

### Positive

- Polling cost drops from ~1 query/scheduler/min to ~2 queries/30min (the
  backstop) — Neon autosuspends again; free-tier budget restored to real work.
- Fire precision improves from "≤ poll interval late" to "second-accurate at
  the earliest due instant" — strictly better for human reminders.
- Restart-survival and missed-fire handling remain free (boot rebuild).
- No schema change; ADR-0027's zero-stored-heartbeat invariant is preserved.

### Negative

- New in-memory state that five write-path hooks must keep consistent with Neon;
  a missed hook is no longer self-healing between polls. Mitigated by the 30-min
  resync backstop (bounded blast radius) and kept explicit in this ADR.
- A buggy/crashing hook could deschedule a job until the next resync; acceptable
  given the backstop and single-VM determinism.

### Neutral / Follow-up

- The resync interval (30 min) and heartbeat floor (60 min) remain tunable.
- If a second VM is ever introduced, the in-memory heap is unsafe (double-fire);
  ADR-0032's leader-election / atomic-claiming prerequisite is unchanged and now
  _also_ covers the heap.

## Related

- ADR-0018 (instance lifecycle; scheduler holds due-times/cadence in memory;
  precision + timer-wheel storage deferred)
- ADR-0024 (cron poll loop — this narrows its rejected-option's reasoning)
- ADR-0027 (heartbeat zero stored state — preserved; new runtime wake method)
- ADR-0026 (cron is agent-authored `/crons/*.md` — unchanged)
- ADR-0031 (turn spine owns the `runtime_turns` anchor — the heartbeat hook
  rides this single choke point)
- ADR-0032 (single VM — the heap is safe because there is exactly one process)