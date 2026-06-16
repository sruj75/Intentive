# ADR 0027: Heartbeat Run-Loop — Ships With Post-Message-Back, Flat No-Backoff Floor, Zero Stored State, Agent-Judged Quiet-Hours

## Status

Accepted

## Date

2026-06-16

## Context

Issue #40 (Heartbeat) is the run-loop/judgment side that ADR-0023 split off from
#38's ingress. ADR-0015/0016/0018/0023 already fixed the architecture (one
Monitoring Turn, two triggers; Per-User Channel run-loop; connection-independent
proactivity engine; two regimes over one Sensory Buffer). They deliberately
deferred three things to "the heartbeat slice": the **cadence value**, the
**active/quiet-hours shape**, and the **cost cap**. This ADR resolves those, plus
two questions surfaced by grilling against the OpenClaw heartbeat pattern and the
product thesis.

Bedrock facts:

- **Heartbeat's only output is Post-Message-Back, which does not exist yet.** A
  Monitoring Turn either stays silent or calls `post_message_back` (ADR-0013), and
  #41 (Post-Message-Back + the connected-client registry) is unbuilt. A heartbeat
  that fires on the main session but cannot deliver would mutate the eternal
  checkpoint with "I decided to ping them about X" while no ping is sent — phantom
  nudges the agent later believes it sent. Ephemeral #39 Cron sidesteps this only
  by mutating nothing.
- **The main-session Monitoring Turn is expensive.** ADR-0015 nails monitoring to
  the main session ("one brain"), so we cannot use OpenClaw's biggest cost lever,
  `isolatedSession` (~100K → ~2–5K tokens/run). Firing a full turn for every user
  on a fixed short interval forever is a real scale cost.
- **The product is an exocortex for executive dysfunction.** The promise is
  `phone → user → work`, not `user → phone → work`: the agent comes to the user.
  Dormancy is therefore the _highest_-signal state (forgot, procrastinated,
  dropped off), not a cue to retreat.
- **Quiet-hours cannot be predicted blindly.** A fixed global window (e.g.
  22:00–08:00) is wrong for night owls and night-shift workers. But "is now a good
  time to reach this user?" is a saliency judgment, which ADR-0014 reserves for the
  agent, not the shell.

## Decision

**Ship #40 together with #41; run heartbeat as a flat, never-backing-off floor
with zero stored per-user state; let the agent own quiet-hours and dormancy
judgment off the onboarding-gathered `USER.md`.**

1. **#40 ships with #41 (combined).** Heartbeat has no meaning without an egress
   path, so Post-Message-Back lands at the same time. The cron→main-session flip
   already scoped into #41 lands here too: the result is **one main-session Turn
   spine with three triggers** (`user_message` → Interactive Turn; heartbeat tick +
   Context Snapshot → Monitoring Turn; Cron fire) and **one egress primitive**
   (`post_message_back`). This is the ADR-0016/0017-amendment "main-thread delivery
   returns" moment.

2. **Flat floor cadence (~60 min).** In the active regime perception already drives
   the turn cadence (~10 min, ADR-0023); the heartbeat floor bites only when
   perception is absent (gym, driving, phone-only). ~60 min matches OpenClaw's
   Anthropic-auth default and is cheaper than 30 min with no loss, since the active
   case is covered by perception.

3. **Zero stored heartbeat state; computed poll-loop.** There is **no heartbeat
   table**, no `next_fire_at` column, no liveness/cadence row. The scheduler mirrors
   the Cron poll loop (ADR-0024) but **computes** due-ness: enumerate
   `agent_instances`, derive "time since last activity / last turn" from the already
   indexed `runtime_events` / `runtime_turns` timestamps (migrations 0003/0005), and
   enqueue a Monitoring Turn for due users onto the Per-User Channel (skip-when-busy,
   ADR-0016). Restart-safety falls out for free because the ledger survives; a missed
   tick self-heals on the next poll (heartbeat is a soft floor, unlike Cron's
   committed promise).

4. **No shell-side dormancy backoff.** Backing off cadence as a user goes quiet was
   considered and rejected: it inverts the product (dormancy = the moment to
   intervene _more_) and it is the **shell making a care/saliency judgment**, which
   ADR-0014 forbids. The shell fires the flat floor for every user forever; the
   **agent** decides re-engage-vs-leave-alone per turn and expresses it through
   `post_message_back`, a scheduled re-engagement **Cron**, or a `MEMORY.md`
   watch-item.

5. **Quiet-hours = agent judgment, not stored, not shell-predicted.** During
   onboarding (`BOOTSTRAP.md`) the agent gathers the user's schedule (wake time, job,
   shift) into `USER.md`, which is **eager-injected every turn** (ADR-0021). On each
   heartbeat turn the brain sees the schedule plus temporal grounding and simply does
   not `post_message_back` while the user is asleep. No global window, no derived or
   stored quiet field. The shell fires 24/7; cold-start (before onboarding) is also
   agent judgment — a brand-new user is not pinged at 3 a.m. because that is obviously
   bad judgment.

6. **Deferred cost levers, bound by "never reduce reach, only reduce redundant
   reasoning."** Two optimizations are named and _not_ built in v1: (a)
   **agent-controlled cadence** — the agent lengthening its own next wake when _it_
   judges the user is fine (ADR-0014's deferred knob; care-preserving because it is a
   reversible judgment, reset the instant anything changes); (b) a **cheap shell-side
   structural quiet-gate** that skips the overnight turn without an LLM call, sourced
   by the agent writing a structured quiet-window via the cron-card frontmatter
   pattern (ADR-0026), never a blind/global window. v1 eats the cost (silenced
   overnight + dormant-user turns) at v1 scale.

## Considered Options

- **Heartbeat now with stubbed egress, before #41.** Rejected: phantom-nudge
  checkpoint poisoning, and it creates a third inconsistent turn path (user=main,
  heartbeat=main-but-mute, cron=ephemeral).
- **Shell-side dormancy backoff** (longer intervals for quiet users). Rejected:
  inverts the exocortex promise and puts a saliency judgment in the shell (ADR-0014).
- **Fixed global quiet-hours window.** Rejected: blind prediction that breaks night
  owls and night-shift workers.
- **`isolatedSession` / `lightContext` heartbeat as the cost lever.** Rejected: it
  reopens ADR-0015's single-brain decision. Cost is instead addressed by the deferred
  agent-controlled cadence, never by splitting the brain.
- **A stored or derived per-user cadence / quiet-hours field in v1.** Rejected:
  `USER.md` + agent judgment already personalizes both, keeping heartbeat at zero
  stored state (preserves the ADR-0023 "no liveness state" line).

## Consequences

### Positive

- Zero new heartbeat schema; one Turn spine for all triggers; ADR-0014-consistent
  (shell schedules, agent judges).
- Fully personalized cadence-of-care and quiet-hours from day one via the onboarding
  flow already built — no freeform→structured extraction needed in v1.
- The cost story has a clear, product-safe path (agent-controlled cadence) instead of
  the abandon-dormant-users path.

### Negative

- v1 pays for silenced overnight turns and dormant-user turns (no cheap structural
  skip yet); accepted at v1 scale, with the deferred levers as the exit.
- No shell safety backstop for interruption timing; night-1 timing rests entirely on
  agent judgment.

### Neutral / Follow-up

- The exact flat-floor value and the deferred structural quiet-gate thresholds remain
  tunable; only the _shape_ is fixed here.
- Reframes ADR-0018's "coarse active/quiet-hours floor for cost/safety": in v1 that
  floor is agent judgment, not a shell window; the shell structural gate is deferred.

## Related

- ADR-0013 (egress via tools; `HEARTBEAT_OK` already dropped — silence = no tool call)
- ADR-0014 (shell is senses/hands; saliency is the agent's)
- ADR-0015 (Monitoring Turn — one mechanism, main session)
- ADR-0016 / ADR-0017 (Per-User Channel run-loop; cron-ephemeral exception, now flipped)
- ADR-0018 (connection-independent proactivity engine; quiet-hours floor)
- ADR-0021 (`USER.md` eager-injected; Procedure Floor injection)
- ADR-0023 (two-regime perception-driven cadence; no stored liveness state)
- ADR-0024 (cron scheduler is a poll loop, not a timer wheel)
- ADR-0026 (cron card = agent file I/O, shell-read row — the future quiet-gate pattern)
- Issues #40 (Heartbeat), #41 (Post-Message-Back + cron flip)
