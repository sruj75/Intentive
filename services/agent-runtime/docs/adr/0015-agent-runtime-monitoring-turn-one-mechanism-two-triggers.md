# ADR 0015: Monitoring Is One Mechanism (a Main-Session Monitoring Turn) with Two Triggers; HEARTBEAT.md Stays Immutable

## Status

Accepted

## Date

2026-06-13

## Context

Intentive's Companion is a real-time **body-double** (ADR-0014): it must notice
when the user drifts off-task and decide, with human-like situational judgment,
whether to intervene. Two earlier framings risked treating this as _two_ systems:

1. **Heartbeat** was described as an "interval-trigger primitive tied to liveness."
2. **Context Snapshot** ingestion was, at one point, leaning toward
   "snapshot-as-message" — each perception event appended to the thread as its own
   message — which read as a second, parallel monitoring path.

Per ADR-0001's governing rule we do not reinvent the wheel: OpenClaw and
DeepAgents are both battle-tested; pick the simpler that does not fight the
committed tool. The official OpenClaw documentation is explicit that **the
heartbeat runs a periodic agent turn in the _main session_ — it is not a separate
monitoring brain.** A Context Snapshot is therefore not a competing mechanism; it
is simply _another reason to run that same monitoring turn now_. Collapsing the
two into one mechanism is both simpler and faithful to the battle-tested pattern.

A second, hard-to-reverse question sat underneath: OpenClaw lets the agent edit
`HEARTBEAT.md` directly (single-tenant, self-hosted). Our ADR-0005 / Bundle Path
Set classified `HEARTBEAT.md` as an **immutable procedure** file (centrally
controlled safety floor; agent writes rejected; line "read, never written"), and
flagged agent-overlaying it as near-irreversible. We are multi-tenant with a
safety floor, so we cannot simply adopt "agent writes HEARTBEAT.md."

## Decision

**Monitoring is one mechanism — a `Monitoring Turn` in the main session — with two
triggers. `HEARTBEAT.md` stays immutable; the per-user watch-list is writable
knowledge.**

1. **One mechanism: the Monitoring Turn.** A real agent turn on the Unified
   Working Context (ADR-0014) whose job is "should I intervene right now?" It runs
   in the **main session** (same brain, no split), reads the immutable
   `HEARTBEAT.md` procedure + the user's `MEMORY.md` watch-list + the injected
   sensory buffer, and either stays silent or calls `post_message_back` (egress
   default per ADR-0013). Silence is "no egress tool called."

2. **Two triggers, same turn.**
   - **Heartbeat** — a periodic timer tick (liveness/cadence driven).
   - **Context Snapshot** — a perception event arriving from a device.
     Either fires the _same_ Monitoring Turn. They are not two systems.

3. **Snapshots arrive via a sensory buffer, not as thread messages.** The shell
   accumulates recent Context Snapshots in a shell-maintained **sensory buffer**
   and injects it into the Monitoring Turn. The unit that enters the thread is the
   _one judgment per wake_, not each raw snapshot. (This supersedes the earlier
   "snapshot-as-message / option a" leaning in ADR-0014.) Raw-snapshot archival
   for audit/replay is optional and served by Langfuse traces.

4. **`HEARTBEAT.md` is immutable procedure (how to monitor); the watch-list is
   writable knowledge (what to watch).** The agent "programs its own monitoring"
   by writing per-user **watch-items** to `MEMORY.md` via the VFS backend — never
   by editing `HEARTBEAT.md`. The Monitoring Turn reads both: `HEARTBEAT.md` for
   _how_ to evaluate (the centrally-improvable safety floor) and `MEMORY.md` for
   _what_ to watch for this user. This is the existing procedure/knowledge split
   (ADR-0005), not a new mechanism.

5. **Cron is separate.** Cron is absolute-time scheduled action; the Monitoring
   Turn is periodic/perception-driven. Distinct primitives.

### Rejected alternative

**Make `HEARTBEAT.md` agent-writable** (OpenClaw-faithful, one file). Simplest
mental model, but it reverses ADR-0005, drops the immutable safety floor for
monitoring reasoning, and reopens the "near-irreversible self-personalization"
concern deliberately deferred. Rejected for v1. The agent still gets full
"program my own monitoring" power through the `MEMORY.md` watch-list, so no
capability is lost — only the central safety floor is preserved.

## Consequences

### Positive

- One monitoring mechanism, faithful to OpenClaw's "heartbeat = main-session
  agent turn" — less to build, no split brain (consistent with ADR-0014).
- Thread growth is bounded: only judgments land in the thread, not every raw
  snapshot, before native compaction.
- Safety floor intact: monitoring _procedure_ stays centrally improvable for all
  users; only the personal watch-list is user-mutable.
- The agent retains real self-directed monitoring (writes its own watch-items).

### Negative

- A Monitoring Turn per trigger per user (~every 10–30 min) is a real cost/scale
  concern (shared with ADR-0014); the answer is agent-controlled cadence later,
  never returning judgment to the shell.
- Two reads per Monitoring Turn (`HEARTBEAT.md` + `MEMORY.md` watch-list) instead
  of one fused file; a small, deliberate cost of the procedure/knowledge split.

### Neutral / Follow-up

- Sensory-buffer retention/size, the exact temporal-grounding fields, and the
  watch-item shape in `MEMORY.md` are implementation details for the
  heartbeat / context-snapshot / memory slices.
- A dedicated writable `WATCHLIST.md` overlay (instead of reusing `MEMORY.md`)
  was considered and deferred — it would add a 7th Bundle Path for marginal
  separation; revisit if the watch-list outgrows `MEMORY.md`.
- If agent-driven behavioral self-personalization is later built (its own ADR per
  the Bundle Path Set decision), it should be **augment** over the base
  `HEARTBEAT.md`, not **replace**.
