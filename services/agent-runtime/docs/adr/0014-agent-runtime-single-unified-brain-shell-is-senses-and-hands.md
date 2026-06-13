# ADR 0014: Single Unified Brain; Shell Is Senses and Hands; the Agent Owns Intervention Judgment

## Status

Accepted

## Date

2026-06-13

## Context

Intentive's Companion is an **exocortex** that scaffolds users with executive
dysfunction (ADHD) — Brown's six executive functions: Activation, Focus, Effort,
Emotion, working Memory, Action. It runs psychological intervention as a
real-time **body-double**: every ~10–30 minutes it ingests Context Snapshots from
macOS/iOS (what the user is doing, on-task vs distracted) and decides whether and
how to intervene.

An earlier proposal (rejected here) ran proactive/perception turns in an
**isolated** context, bridging to the chat only through distilled long-term
memory. That **splits the brain**: the conversational agent would lack
fine-grained, real-time screen awareness and would intervene off stale digests.
For an exocortex — the user's _external working memory_ — fragmenting its own
memory is self-defeating.

A second rejected proposal put a **shell-side saliency gate** in front of the
agent ("is this snapshot worth waking the agent for?"). That moves _situational
judgment_ — the most human capability the agent has — into the shell, producing
robotic behavior.

## Decision

**One unified brain. The shell is senses and hands. No judgment lives in the
shell.**

1. **Single unified working context.** User messages _and_ Context Snapshots feed
   the _same_ tier-1 working context and the _same_ tier-2 durable memory. The
   two DeepAgents tiers are **time horizon (recent vs durable), not source**:
   recent perception + conversation stay in the working window; the native
   compaction middleware distills older perception into durable memory
   (USER.md/MEMORY.md) and evicts raw snapshots. Nothing is siloed by source.

2. **The shell is senses + hands, never a judge.**
   - _Senses:_ faithfully deliver reality — every Context Snapshot plus temporal
     grounding (current time, time-of-day, time since last interaction). The
     shell _transduces_ raw signals into agent-readable form; it never decides
     salience or whether to intervene.
   - _Hands:_ execute whatever the agent decides (deliver a Post-Message-Back,
     schedule a cron, write memory).

3. **The agent owns intervention judgment.** Every snapshot is a _real agent
   turn_ on the unified context. The agent decides silent-vs-act itself, and acts
   only by calling an egress tool (Post-Message-Back) — see ADR-0013. The agent's
   own silent-vs-act choice is the _only_ gate, and it is the agent's. There is no
   shell saliency gate.

4. **Display boundary ≠ brain boundary.** Context Snapshots feed the brain but are
   **not** rendered as chat. `conversation_messages` (what Mobile shows) holds
   only chat: user messages, companion replies, PMBs. One brain that sees all;
   one clean chat timeline. Screen perception is stored separately and fed to the
   working context, not into the chat transcript.

## Consequences

### Positive

- Grounded, human-like body-doubling: continuous real-time awareness + the
  agent's own situational judgment.
- No split-brain context gap; the exocortex has one memory.
- Consistent with ADR-0012 (the thread checkpoint _is_ the unified working
  context) and ADR-0013 (egress via tools; silent by default).

### Negative

- A full agent turn per snapshot per user (~every 10–30 min) — a real cost/scale
  concern. It will **not** be solved by returning judgment to the shell.
- The eternal thread now ingests perception too, so it grows faster; the
  summary-of-summary drift risk (ADR-0011/0012) is larger. Phase 11 retention.

### Neutral / Follow-up

- The human-like answer to cost is **agent-controlled cadence** (the agent sets
  how often to be woken based on context, e.g. tighter near a deadline). v1 may
  use a fixed cadence with the agent judging each tick; agent-controlled cadence
  is a later refinement, keeping judgment with the brain.
- **Perception enters the brain via a sensory buffer, not as individual thread
  messages.** Context Snapshots accumulate in a shell-maintained **sensory buffer**
  (recent raw perception) that is injected into each **Monitoring Turn**; the unit
  that enters the thread is the _one judgment per wake_, not each raw snapshot.
  (This supersedes an earlier "snapshot-as-message / option a" leaning recorded
  here.) Monitoring is one mechanism with two triggers — a heartbeat timer tick or
  an arriving snapshot both fire the same main-session Monitoring Turn — see
  ADR-0015. Perception is **not** written to `conversation_messages` and not shown
  as chat. Thread growth is bounded because only judgments (not raw snapshots)
  land in the thread, then native compaction (Phase 11 retention/drift risk,
  accepted). A separate raw-perception archive for audit/replay is optional;
  Langfuse traces capture per-turn inputs.
- The exact temporal-grounding fields are an implementation detail for the
  context-snapshot / heartbeat slices.
