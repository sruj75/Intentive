# ADR 0023: Perception-Driven Cadence — Two Regimes Over One Sensory Buffer, Scaling Toward Real-Time

## Status

Accepted

## Date

2026-06-15

## Context

Issue #38 makes inbound **Context Snapshots** and **Session End Markers** usable by
the Companion. The naive reading of the issue ("snapshots become durable events";
"markers update liveness state") was already partly satisfied by #28 (both land in
the `runtime_events` ledger, idempotent) and risked a face-value design: a separate
snapshot table plus a stored `capture_live` boolean toggled by the marker. Working
from first principles surfaced a deeper question the issue does not answer: **how
should the agent actually process incoming perception and decide when to
intervene**, given the cadences v1 can afford?

Bedrock facts:

- **v1 cadences are mismatched.** Heartbeat fires every ~30–60 min; Context
  Snapshots arrive every ~10 min. Between two heartbeats, several snapshots land.
- **The product is a real-time body-double** (ADR-0014). A body-double that only
  "wakes" on the 30–60 min heartbeat would notice a user drifting off-task up to an
  hour late — by then the moment has passed and the help is useless.
- **The vision is continuous perception.** The trajectory is snapshots at 10 min →
  1 min → real-time, where heartbeat and perception fuse into one always-processing
  stream (a human is constantly awake, constantly analyzing). v1 cannot be
  real-time: the infrastructure isn't there and an LLM turn 24/7 per user is too
  expensive.

So the design must be responsive _now_ within v1's cost envelope, **and** be the
same design that slides toward the real-time ideal by turning a knob rather than by
a rewrite. This also forces the #38/#40 boundary: which part of "react to
perception" is ingress (#38, senses) and which is the run-loop (#40, judgment).

## Decision

**The agent reacts on the fastest signal available. Perception and heartbeat are
not two competing triggers but two _regimes_ over one shared Sensory Buffer, which
collapse into a single Monitoring Turn. The cadence is a knob that scales the same
design from v1's 10-minute responsiveness toward continuous real-time processing.**

1. **One substrate: the Sensory Buffer.** All inbound perception (Context Snapshots,
   and the Session End Marker as a timestamped fact) accumulates in the **Sensory
   Buffer** — in v1 a read projection over the `context_snapshot` rows already in
   `runtime_events`, not a new store (see `CONTEXT.md`). There is **no** separate
   stored liveness state; capture liveness is emergent from buffer freshness and is
   judged by the agent, not the shell (ADR-0014).

2. **Active regime — perception is the clock.** While snapshots are flowing (user at
   the laptop), each snapshot is what warrants a Monitoring Turn. The agent processes
   activity at snapshot cadence (~10 min in v1) and decides silent-vs-nudge itself.
   Cost is self-limiting: snapshots flow only when the user is present to be helped,
   so we pay for thinking exactly when it is valuable.

3. **Idle/away regime — the slow heartbeat is the clock.** When no snapshots arrive,
   the ~30–60 min heartbeat fires regardless and reaches the user via Post-Message-Back
   push (gym, driving). It is the always-on floor so the Companion never goes fully
   dark, and it is cheap because it is slow and only carries when perception is absent.
   The heartbeat is never gated by capture state (ADR-0018).

4. **One turn, never two.** When a heartbeat tick and a snapshot would fire close
   together, they collapse: any trigger runs _the single Monitoring Turn_ over
   whatever is currently in the buffer. At most one Monitoring Turn is pending per
   user (ADR-0016), which is also where per-user cost is bounded.

5. **Cadence is the scaling knob.** Today turn cadence ≈ snapshot cadence ≈ 10 min.
   As perception speeds up (1 min → real-time), the same "perception drives the turn"
   architecture tracks it toward "always processing," capped by an agent/shell-controlled
   cadence ceiling so cost stays bounded. No redesign is required to move along this
   path — only the cap changes.

6. **#38/#40 seam.** #38 owns _senses_: append accepted perception to the buffer and
   raise a lightweight "perception arrived, a Monitoring Turn is warranted" signal.
   #38 does **not** run the turn, decide concurrency, or judge whether a snapshot is
   worth a turn (saliency in the shell is forbidden by ADR-0014). #40 owns the
   _run-loop_: the heartbeat floor, the cadence policy (how often a raised hand
   becomes a turn), collapsing to one pending, and the active/quiet-hours floor.

## Considered Options

- **Heartbeat-only firing (PULL); snapshots merely enrich the next scheduled turn.**
  Rejected: with a 30–60 min heartbeat the agent reacts up to an hour late, defeating
  the body-double, and it is a dead end — sub-heartbeat responsiveness would require
  ripping it out rather than turning a knob.
- **A separate snapshot table + stored `capture_live` boolean toggled by the marker.**
  Rejected: duplicates durable truth already in the ledger, adds a second retention
  policy, and a shell-computed staleness boolean is the shell judging "active," which
  ADR-0014 forbids. See the liveness resolution in `CONTEXT.md`.

## Consequences

### Positive

- Responsive within v1 cost limits; cost self-limits to active periods.
- The same architecture scales to real-time by raising the cadence cap — no rewrite.
- Clean #38/#40 split: ingress stays senses, the run-loop owns judgment/cadence.
- No new storage and no stored liveness state to keep correct.

### Negative

- A Monitoring Turn per snapshot per active user (~every 10 min) is a real cost/scale
  concern (shared with ADR-0014/0015); the answer is the agent-controlled cadence cap,
  never returning saliency judgment to the shell.

### Neutral / Follow-up

- Reframes an #38 acceptance criterion ("Session End Markers update liveness state")
  to "the marker is an unreliable, faster, explicit end hint over the buffer; there is
  no liveness state." Deliberate, recorded here so it is not "fixed" back.
- Exact snapshot/heartbeat intervals and the cadence-cap value are
  #40/heartbeat-slice tuning, not fixed here.
- **v1 injects exactly one item per turn** — the single most recent perception event
  (latest snapshot, or `session_end_marker` if newer). No sliding window and no
  re-sending: the agent's Checkpoint already carries what it saw on prior turns, so
  re-injecting old summaries is pure context bloat. "Inject everything new since the
  last turn" (with a read-watermark) is a deliberate deferred upgrade.
- **Known gap (post-v1):** snapshot-absence alone cannot distinguish "user left" from
  "Desktop/network/Runtime failure"; the marker only partially closes this when
  delivered. A reliable presence/keepalive signal is deferred.

## Related

- ADR-0014 (single unified brain; shell is senses, not judge)
- ADR-0015 (Monitoring Turn — one mechanism, two triggers)
- ADR-0016 (Per-User Channel run-loop; collapse to one pending Monitoring Turn)
- ADR-0018 (heartbeat is connection/capture-independent proactivity engine)
- `CONTEXT.md` — Sensory Buffer term; "liveness state" flagged ambiguity resolution
