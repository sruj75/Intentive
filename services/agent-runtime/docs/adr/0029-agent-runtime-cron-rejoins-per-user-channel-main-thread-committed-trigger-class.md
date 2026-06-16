# ADR 0029: Cron Rejoins the Per-User Channel — Main-Thread Fires, Committed/FIFO Trigger Class, Ephemeral Stopgap Retired

## Status

Accepted

## Date

2026-06-16

## Context

ADR-0016 made the **Per-User Channel** the single run-loop: one checkpoint per user
(ADR-0011/0014), so exactly one turn runs at a time, and every trigger is arbitrated
there. It designed Cron as "enqueue-with-priority." ADR-0017's amendment then carved
out a **v1 exception**: issue #39 Cron fires through the scheduler on a **silent
ephemeral thread** that bypasses the Channel, appends no Conversation History, and
does not touch the main checkpoint — explicitly a stopgap "until Post-Message-Back
(#41) provides user-facing egress," because an undelivered reminder attempt mutating
the eternal thread would be a phantom nudge.

ADR-0027 ships #40 with #41, and ADR-0028 builds the delivery path. With egress now
real, the stopgap's reason to exist is gone. This ADR resolves how Cron rejoins the
main session.

The code makes the choice concrete:

- `createCronTurnHandler` (`cron/service/cron-turn.ts`) is called **directly by the
  scheduler** (`createCronScheduler` → `fireCron`), runs `turn(...)` on a **fresh
  ephemeral `threadId`** (`cron:${job.id}:${firedAt}:${uuid}`), and **bypasses the
  Per-User Channel**. This is only safe because the ephemeral turn mutates nothing
  shared.
- `turn(...)` is already the **shared Turn Execution spine** that interactive turns
  use; it already takes `trigger`, `threadId`, and transactional `onSuccess`/
  `onFailure` hooks. So Cron's lifecycle (reschedule / delete one-shots / transient
  retry / `cron_runs`) travels with the turn wherever it runs.

Once a Cron fire runs on the **main checkpoint**, running it off-Channel would let it
execute concurrently with an interactive turn and corrupt the checkpoint. So the flip
is fundamentally: **Cron must rejoin the single-writer Channel.**

## Decision

**Cron enqueues onto the Per-User Channel and runs as a main-thread turn, in a new
"committed" trigger class (never dropped, FIFO, but not ahead of user messages). The
ephemeral-thread / silent stopgap is retired.**

1. **Option A — enqueue onto the Channel** (chosen over keeping a separate fire path
   that merely borrows the lock). The scheduler stops invoking `fireCron` directly;
   it enqueues a cron-fire trigger and the Channel run-loop runs it. The Channel _is_
   the serialization point (ADR-0016); Heartbeat already enqueues onto it (ADR-0027);
   a second locking path would duplicate the invariant and drift.

2. **Main thread, not an ephemeral thread.** A Cron fire runs on the user's **main
   checkpoint** — the same thread interactive and Monitoring Turns use. Its reasoning
   joins the one eternal conversation (ADR-0011) and it can `post_message_back`
   (ADR-0028). The `cron:…` ephemeral thread id is removed.

3. **Four triggers, two arbitration classes.** Arbitration is no longer
   FIFO+collapse+"prioritized cron"; it is two clean classes:
   - **Committed** — `user_message` and **cron fire**: enqueue, **never dropped**,
     run **FIFO**. A Cron is a promise ("ping me at 9am"); it must not be collapsed or
     skipped. Its `onSuccess`/`onFailure` lifecycle hooks ride the turn unchanged.
   - **Best-effort** — Heartbeat tick and Context Snapshot: **at most one pending
     Monitoring Turn**, **skip-when-busy**, burst-collapsing (ADR-0015/0027).

4. **Cron does not jump ahead of user messages.** ADR-0016's "with-priority" is read
   as priority over _collapsible_ (best-effort) triggers, not over interactive turns.
   A user actively typing must not wait behind a cron fire; Cron waiting its FIFO turn
   for a few seconds is fine. So: "never dropped," not "runs first."

5. **Retry scope narrows, logic unchanged.** Once serialized, scheduling contention
   is no longer a failure mode — a fire **waits** for the lane rather than erroring —
   so `cron-turn.ts`'s transient-retry/backoff now covers only genuine
   turn-execution errors (model overload, etc.), which is exactly what `isTransient`
   already matches. No code logic change; narrower applicability.

## Considered Options

- **Option B — keep the scheduler's separate fire path, acquire the Channel lock
  inside `fireCron`.** Rejected: two paths to the same per-user serialization
  invariant, free to drift; the Channel already exists to be _the_ path.
- **Keep Cron on an ephemeral thread but serialized.** Rejected: the ephemeral thread
  was a stopgap for the no-egress era; with #41 the point of the flip is precisely to
  let Cron speak on the main thread.
- **Cron preempts / runs ahead of user messages.** Rejected: interactive latency
  matters more than a few seconds of cron delay; committed-but-FIFO preserves the
  promise without harming the live conversation.

## Consequences

### Positive

- One writer, one run-loop, one thread for all four triggers — the ADR-0016 invariant
  finally holds without exception.
- Cron can `post_message_back`; reminders actually reach the user.
- Arbitration simplifies to committed vs best-effort, replacing the three-way
  "FIFO + collapse + prioritized cron" description.

### Negative

- A long-running interactive/Monitoring turn delays a due Cron fire (it waits FIFO).
  Acceptable: Cron is a soft-real-time promise, not hard-real-time; the 5-minute floor
  dwarfs lane-wait.
- Cron reasoning now mutates the eternal checkpoint, so a noisy cron prompt can add
  thread weight — mitigated because a silent turn appends no user-facing message
  (egress is still tool-gated, ADR-0013).

### Neutral / Follow-up

- Supersedes the ADR-0017 amendment's v1 ephemeral-cron exception and ADR-0016's
  "prioritized cron" wording; both are now "committed-class, FIFO, main-thread."
- The scheduler still owns _due-ness_ (poll loop, ADR-0024) and cron lifecycle; only
  the _execution path_ moves onto the Channel.

## Related

- ADR-0011 (one eternal conversation), ADR-0014 (single brain), ADR-0015 (Monitoring
  Turn)
- ADR-0016 (Per-User Channel run-loop; "enqueue-with-priority" — refined here)
- ADR-0017 (v1 cron in main session, isolation deferred; its ephemeral amendment is
  retired here)
- ADR-0024 (cron scheduler poll loop — still owns due-ness)
- ADR-0027 (#40 ships with #41; Heartbeat enqueues on the Channel)
- ADR-0028 (Post-Message-Back delivery — the egress Cron now reaches)
- Issues #39 (Cron), #41 (Post-Message-Back + the flip)
