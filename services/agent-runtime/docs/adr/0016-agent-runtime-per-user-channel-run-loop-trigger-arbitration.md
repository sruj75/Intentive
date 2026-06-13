# ADR 0016: The Per-User Channel Is the Single Run-Loop; Trigger Arbitration = FIFO User Turns + Collapsing Monitoring Turns + Prioritized Cron

## Status

Accepted

## Date

2026-06-13

## Context

Three earlier decisions combine into a concurrency constraint that was not yet
designed for:

- **One eternal thread per user** (ADR-0011) and **one unified brain** (ADR-0014)
  mean there is exactly **one LangGraph checkpoint per user**. Two agent turns
  cannot run against it concurrently — the second would corrupt or race the
  checkpoint.
- **Four trigger sources** now want to start a turn: a `user_message`, a
  **Context Snapshot**, a **Heartbeat** tick, and a **Cron** fire (ADR-0015,
  ADR-0013). Two of them (heartbeat, cron) are timer-driven and fire even when the
  user is offline (always-alive). The other two — `user_message` and Context
  Snapshot — are **inbound pushes** from the client over the Protocol; the runtime
  does not poll for snapshots.

The pre-existing **Per-User Channel** (ADR-0007 ordering queue, ADR-0009
transactional ingress) already serializes _writes_ and _reads_ per `user_id`, but
its contract did not cover **agent-turn execution** or arbitration between trigger
sources.

Per ADR-0001 we do not reinvent the wheel. OpenClaw already solves this:

- Its `SessionKey` is "the bucket key used to store context **and control
  concurrency**" (`routing-llms.txt`) — one lane per key.
- Queued runs **preserve per-session ordering until the lifecycle completes**
  (`channels-llms.txt`) — FIFO, no preemption of in-flight work.
- Bursts of inbound messages are **debounced into one batch** event
  (`channels-llms.txt`).
- Heartbeats are **skip-when-busy**: "if the main queue, target session lane, cron
  lane, or an active cron job is busy, the heartbeat is skipped and retried later,"
  and heartbeats "automatically defer while cron work is active or queued"
  (`heartbeat-llms.txt`). OpenClaw does **not** build a backlog of stale ticks.

## Decision

**Promote the Per-User Channel from "ingress/read serializer" to the single
per-user run-loop, and arbitrate the four triggers as follows.**

1. **One run-loop, one turn at a time.** Every trigger is enqueued/arbitrated on
   the same per-`user_id` channel; the channel runs **exactly one agent turn at a
   time** against that user's checkpoint. No new locking primitive — we extend the
   thing that already owns per-user ordering. **In-flight turns are never
   preempted.**

2. **`user_message` (inbound push): FIFO, never dropped.** Enqueue in arrival
   order; a rapid burst is **debounced** into a single turn (OpenClaw's debounced
   batch). A user turn always eventually runs.

3. **Context Snapshot (inbound push): collapse into the sensory buffer.** A
   snapshot appends to the shell-maintained **sensory buffer** (ADR-0015) and
   ensures **at most one pending Monitoring Turn**. A burst of snapshots collapses
   into the buffer — never one turn per snapshot. When the pending Monitoring Turn
   runs, it reads the _latest_ buffer.

4. **Heartbeat tick (timer): skip-when-busy.** If the lane is busy or a Monitoring
   Turn is already pending, the tick is **dropped** (not queued); the next tick
   re-evaluates fresh state. This is OpenClaw's actual mechanism and is simpler
   than coalescing stale ticks — and it guarantees a Monitoring Turn always
   reasons over current state, never a merged-stale one.

5. **Cron fire (timer): enqueue, prioritized over Monitoring Turns.** Cron is a
   committed scheduled action, so it is never silently dropped, and it **outranks**
   Monitoring Turns (heartbeat/monitoring defer to cron, per OpenClaw). Cron does
   not preempt an in-flight turn; it jumps ahead of a _pending_ Monitoring Turn.

**Net invariant:** Monitoring Turns collapse to **at most one pending per user**
and always reason over the latest buffer + state; **user turns never collapse**
(FIFO); **cron outranks monitoring**; **in-flight turns are never preempted**.

## Consequences

### Positive

- The single-checkpoint constraint is satisfied with no new primitive — the
  Per-User Channel already owns per-user ordering.
- Faithful to OpenClaw (SessionKey concurrency, FIFO, debounce, skip-when-busy);
  adapted, not reinvented.
- No stale-tick backlog: skip-when-busy means a Monitoring Turn is always current.
- User messages cannot starve — they are FIFO and only ever wait behind one
  in-flight turn plus (at most) one pending Monitoring Turn or a prioritized cron.

### Negative

- Snapshots and user messages arriving while a turn is in-flight wait for it to
  finish (no preemption); worst-case added latency is one turn's duration. v1
  accepts this; explicit user-priority **preemption** is a later refinement.
- Skip-when-busy can drop a heartbeat tick under sustained load; acceptable
  because the next tick re-evaluates and the sensory buffer still carries the
  perception that matters.

### Neutral / Follow-up

- The debounce window, the snapshot→buffer flush policy, and the exact queue data
  structure are implementation details for the `sessions` / `heartbeat` /
  context-snapshot slices.
- Agent-controlled cadence (ADR-0014) will tune how often heartbeat ticks fire;
  this ADR governs _arbitration_, not cadence.
- Offline users still get timer-driven Monitoring Turns and cron fires (always-
  alive); delivery then routes through Post-Message-Back push (ADR-0013).
- User-priority **preemption** of an in-flight Monitoring Turn (cancel-and-rerun
  when the user speaks) is deferred; it would need turn cancellation semantics
  that v1 does not yet have.
