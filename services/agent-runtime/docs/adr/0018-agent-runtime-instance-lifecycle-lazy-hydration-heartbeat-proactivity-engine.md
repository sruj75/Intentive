# ADR 0018: Agent Instance Lifecycle — Logical Instance, Lazy Hydration, Idle Eviction, One Scheduler; Heartbeat Is the Connection-Independent Proactivity Engine

## Status

Accepted

## Date

2026-06-13

## Context

The Agent Runtime is one always-alive VM serving many users (multi-tenant, shared
compute, scoped by `user_id`). Several prior decisions assumed a runtime form
without pinning it down:

- ADR-0014/0015 run a Monitoring Turn in the main session; ADR-0016 makes the
  Per-User Channel the main-checkpoint run-loop; ADR-0017 originally leaned
  Cron main-session, but issue #39 amended Cron to fire on silent ephemeral
  threads until Post-Message-Back/main-thread delivery lands.
- ADR-0011/0012 keep one eternal thread per user with state durable in Neon (the
  LangGraph checkpoint), and the Agent Instance is already defined as _"a row —
  not a process, not a VM, not a container."_

The open question: is each user's agent a **resident in-memory brain** held open
24/7, or built **on demand**? Resident-per-user does not scale — thousands of idle
brains consuming memory for users who are asleep. And if nothing is resident, what
fires **heartbeat/cron for a user who has no live connection**?

A second issue surfaced and corrected a wrong earlier lean: an initial proposal
gated monitoring on an **active Capture Session** (desktop screen capture). That is
wrong for the product. The Companion is a body-double across the user's **whole
life**, not a screen-watcher. Productivity and the need for support do not end when
the laptop closes — the user may be at the gym needing a push, or driving with
anxiety spiking, reachable only on their phone. Gating monitoring on screen
capture would silence the agent in exactly the off-laptop moments a body-double
matters most. The **Heartbeat is the proactivity engine** (as the OpenClaw docs
show: heartbeat runs periodic agent turns in the main session _as the_ proactivity
mechanism); **Context Snapshots are one perception source that enriches a turn,
not a precondition for one.**

OpenClaw's process model informs the lifecycle: it does not hold a resident agent
per session — it keeps durable state in the store and spins up an **on-demand
drain loop** per session key, tearing it down when idle, and **timers wake** the
agent (`agent-runtime-llms.txt`). LangGraph's checkpointer persists thread state to
Neon at step boundaries, so an Agent Instance is reconstructible from `user_id` and
an interrupted turn is resumable.

## Decision

**Agents live as data, wake on demand, and sleep when quiet — driven by one
always-running scheduler. "Always-alive" = the server and scheduler never sleep,
not a brain-per-user.**

1. **Logical instance (lives as data).** Durable truth is Neon — checkpoint +
   bundles + memory + Conversation History. No resident per-user brain.

2. **Lazy hydration (wakes on demand).** When a main-thread trigger fires for a
   user — a `user_message`, a Context Snapshot, or a Heartbeat **wake** — the
   runtime builds that user's brain in memory _then_, by hydrating the
   checkpoint, and runs the turn on the Per-User Channel (ADR-0016). Issue #39
   Cron hydrates a silent ephemeral thread instead.

3. **Idle eviction (sleeps when quiet).** After the user goes quiet, the
   in-memory brain is dropped to free resources; nothing is lost because state is
   in Neon. The next trigger re-hydrates from scratch.

4. **One process-wide scheduler drives offline triggers.** A single shell-owned
   scheduler holds every user's cron due-times (from Neon) and heartbeat cadence.
   Heartbeat enqueues onto the Per-User Channel, hydrating the lane. Issue #39
   Cron fires through the scheduler's silent ephemeral path. This keeps offline
   proactivity available with **no live connection**; user-facing delivery
   returns with Post-Message-Back.

5. **Heartbeat is the connection-independent proactivity engine.** It fires on
   cadence regardless of capture session or connection state. Context Snapshots
   only **enrich** a Monitoring Turn when present (ADR-0015) — an empty/stale
   sensory buffer is one missing sense, never a reason to skip the turn. The only
   gate is a coarse **active/quiet-hours** floor for cost/safety; even within
   hours, whether to interrupt stays the agent's judgment (ADR-0014). Cadence may
   become agent-controlled later (ADR-0014).

6. **Restart-resumable.** Neon-persisted checkpoints survive a VM restart; an
   in-flight turn resumes from its last checkpointed step (Persistence Adapter).
   On boot the scheduler queries Neon for due work and fires overdue timers in a
   **controlled, non-stampeding** way (ADR-0016 skip-when-busy + snapshot
   debounce bound the monitoring stampede; Cron overdue handling is a cron-slice
   detail).

## Consequences

### Positive

- Scales: one VM serves many users; only _active_ users occupy memory.
- Proactivity reaches the user anywhere (gym, driving, phone-only), because the
  always-running scheduler can fire without any device session.
- Consistent with the Agent-Instance-as-a-row definition, ADR-0016 run-loop, and
  the durable-checkpoint memory model (ADR-0012).
- Faithful to OpenClaw's on-demand-drain + timer-wake model; LangGraph-native
  resumability — no fighting either tool.

### Negative

- Hydration adds cold-start latency to the first turn after idle; mitigated by
  keeping recently-active lanes warm (eviction policy is tunable).
- A full Monitoring Turn per heartbeat tick per user is a real cost at scale
  (shared with ADR-0014); answer is agent-controlled cadence + active-hours floor,
  never gating on screen capture.

### Neutral / Follow-up

- Eviction policy (idle timeout vs LRU cap), warm-set sizing, scheduler precision,
  and the timer-wheel storage are implementation details for the `runtime` /
  `sessions` / `heartbeat` / `cron` slices.
- Active/quiet-hours configuration shape and per-user overrides are deferred to
  the heartbeat slice; the _floor exists_, the exact knobs are later.
- Agent-controlled cadence (ADR-0014) tunes tick frequency; this ADR governs the
  lifecycle and the proactivity-engine framing, not cadence values.
