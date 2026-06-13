# ADR 0013: Egress via Explicit Tools + Trigger-Type Default, Not Shell-Side Output Classification

## Status

Accepted

## Date

2026-06-13

## Context

The v1 implementation plan models Runtime output as a **shell-side classifier**:
"treat DeepAgents output as a candidate; the shell decides silent / normal reply
/ Post-Message-Back" (Phase 5 step 6, Phase 10). That makes the shell inspect the
agent's final message and guess intent.

Per ADR-0001 and its sharpening (both OpenClaw and DeepAgents are battle-tested;
pick the simpler that does not fight the committed tool), this is worth
re-examining. OpenClaw itself uses a **mix**: a `message` tool for proactive
sends (e.g. media completions: "send with the `message` tool, then reply
`NO_REPLY`") and **sentinel strings** (`HEARTBEAT_OK`, `NO_REPLY`) for silence;
cron defaults to `silent` notify policy. DeepAgents is tool-native — tools are
how an agent acts.

## Decision

Runtime egress is **explicit tools plus a trigger-type default**, not output
classification.

1. **Trigger type sets the default egress.**
   - **Interactive turn (`user_message`)**: the agent's returned final message is
     the reply — delivered and persisted. No classification.
   - **Proactive turn (cron fire, heartbeat tick, context snapshot)**: **silent
     by default**; the returned text is internal reasoning and is not delivered.

2. **Post-Message-Back is a tool the agent calls**, not a classification. On a
   proactive turn, user-facing output occurs only if the agent calls it. The
   tool handler persists to `conversation_messages` and decides, by connection
   state, whether to stream live (connected) or hand off to Control Plane push
   (offline). The tool call _is_ the Phase 10 delivery record, so "every push
   originates from a Post-Message-Back" holds by construction.

3. **Self-scheduling is a tool** (`schedule_cron`-style): the agent picks its own
   time; Intentive owns the durable job.

4. **Drop sentinel-string classification** (`HEARTBEAT_OK` / `NO_REPLY`). Silence
   is "no egress tool called on a proactive turn"; no string parsing needed.

Post-Message-Back is therefore the single proactive egress; whether it pushes vs
delivers live is decided inside the tool, so there is no separate
"proactive reply to a connected user" path.

## Consequences

### Positive

- Removes a fuzzy classifier; egress is explicit and auditable.
- DeepAgents-native (tools = actions); no fighting the harness.
- Phase 10 delivery record is created by the tool call itself.
- Unifies live-delivery vs push under one primitive.

### Negative

- Requires registering and prompting product tools (PMB, schedule-cron) so the
  agent reliably uses them on proactive turns; a proactive turn that "wants" to
  speak but forgets the tool stays silent. Prompt/eval must cover this.

### Neutral / Follow-up

- The implementation plan's Phase 5 step 6 and Phase 10 wording should be updated
  to this model.
- The exact tool names, argument shapes, and permission/audit policy are an
  implementation detail for the tools/runtime slice.
