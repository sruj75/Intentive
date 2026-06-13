# ADR 0020: Ingress Ack Is Decoupled from Turn Success; Turn Failures Are Contained, Not Thrown

## Status

Accepted

## Date

2026-06-14

## Context

ADR-0016 made the **Per-User Channel** the single run-loop, and the #36
DeepAgents-integration slice runs an **Interactive Turn** as part of the same
queued unit that performs ingress: for a `user_message` the lane does
`txn{ ledger marker + user-msg projection }` → `invoke turn` →
`txn{ companion append + runtime_turns }`. Egress for an interactive turn is the
agent's returned final message (ADR-0013), silent-by-nothing — there is no
proactive tool involved.

A turn can fail for reasons unrelated to ingress: the model errors, a tool throws,
the provider times out. ADR-0013 already establishes that a _proactive_ turn may
legitimately produce **no** user-facing output ("silence is no egress tool
called"). The interactive lane needs the analogous rule for a _failed_ turn: the
user sent a message, the message was durably accepted, but no reply is produced.

The trap is in how "silent" is implemented. The per-user queue
(`user-queue.ts`) chains tasks as `previous.catch(() => undefined).then(task)`, so
a rejected task does not poison the lane for _future_ tasks — but the promise the
task returns to `accept`'s caller still rejects. If a turn failure is allowed to
throw out of `accept`, two bugs occur at once: (1) the gateway sees ingress
"fail" even though the user message **did** commit in the first transaction, and
(2) an unhandled rejection rides out of the lane. "Silent to the user" must not
mean "throw out of `accept`."

## Decision

**The ingress acknowledgement is decoupled from turn success. Ingress-transaction
failure rejects `accept`; turn (invoke/append) failure is caught, recorded, and
`accept` resolves.**

1. **Ingress-txn failure → `accept` rejects.** If the first transaction (ledger
   marker + user-message projection) fails, the message was _not_ durably
   accepted; `accept` rejects so the gateway/client learns ingress failed.

2. **Turn failure → caught, recorded, `accept` resolves.** A failure during
   `invoke` or the companion-append transaction is caught inside the queued task,
   recorded as `runtime_turns(status = failed, trace_id, error)`, and **not
   rethrown**. The message _was_ durably accepted; the missing reply is a recorded
   internal outcome — **silent to the user, loud in `runtime_turns` and logs,
   invisible to the lane and to the ingress ack**.

3. **No auto-retry in v1.** A failed turn is not silently re-run. Crash-mid-turn
   resumability is the checkpoint-level concern of ADR-0018 (resume from the last
   checkpointed step on restart), not an in-process retry loop in the run-loop.

4. **Idempotent companion append.** The runtime generates the companion
   `message_id` up front and the append is write-once (`ON CONFLICT DO NOTHING`),
   so a best-effort in-process retry of the append step cannot double-write.

## Consequences

### Positive

- The ingress contract stays honest: an ack means "durably accepted," never
  "successfully replied." Clients and downstream slices can rely on it.
- No false ingress-failure signals and no unhandled rejection escaping the lane;
  the per-user run-loop keeps draining cleanly after a failed turn.
- Failed turns are observable (`runtime_turns` + Langfuse trace) without surfacing
  as protocol errors.

### Negative

- In v1 a user whose turn fails gets **silence** with no in-band error bubble
  (delivery/UX of failures is a client + #41 concern). Accepted for #36.
- "Accept resolves even though the turn failed" is counterintuitive and a future
  reader may be tempted to make `accept` reject on turn failure — which this ADR
  exists to prevent. The decoupling is deliberate.

### Neutral / Follow-up

- A user-visible failure signal (error event) and/or a bounded retry policy can be
  added later without changing this contract — they would consume the recorded
  `runtime_turns(status = failed)` outcome, not move the throw back into `accept`.
