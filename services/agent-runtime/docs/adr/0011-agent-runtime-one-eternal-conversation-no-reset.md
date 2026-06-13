# ADR 0011: One Eternal Companion Conversation Per User — No Conversation Reset in v1

## Status

Accepted

## Date

2026-06-13

## Context

OpenClaw rolls a conversation transcript into a fresh `sessionId` on three
triggers: explicit `/new`/`/reset`, a **daily reset** (4am gateway-local), and
**idle expiry**. Each new `sessionId` is a new transcript file — a clean slate.
That mechanism mainly exists to bound context growth and give per-work-session
fresh starts in a coding-agent setting.

Per ADR-0001 we default to OpenClaw patterns and diverge only with explicit
rationale. This is a divergence.

Our product is a continuous, always-on **Companion**, not a per-task agent. Under
ADR-0010, `conversation_messages` is the authoritative transcript and the model
context is rebuilt from it each turn, with **compaction** bounding growth.

## Decision

There is **one eternal Companion conversation per `user_id`** in v1.

- `conversation_messages` is a single continuous stream per user — never
  segmented into per-conversation transcripts, never reset.
- We do **not** adopt OpenClaw's `/new`, daily-reset, or idle-expiry rollover.
- **Compaction** (ADR-0010), not reset, bounds context size.
- No user-initiated "start over" or forget/erase seam is reserved in v1.

"Session" therefore never means the conversation. Its only legitimate qualified
uses are **Bound Session** (WebSocket connection), **Capture Session** (Desktop
screen-capture period), and **Session Snapshot** (reconnect projection). See
`CONTEXT.md` flagged ambiguities.

## Consequences

### Positive

- Matches the always-on companion product model and ADR-0001's "one continuous
  session per user."
- Removes a major source of the overloaded "session" vocabulary.
- Simpler reconnect/snapshot semantics — one stream, no per-session selection.

### Negative

- We lean entirely on compaction for context management; there is no reset
  escape hatch if compaction misbehaves.
- A future "forget/start over" feature (e.g. a privacy control) is not seamed
  for and would need its own design.

### Neutral / Follow-up

- If a forget/erase or fresh-start product need appears, it gets its own ADR
  rather than reintroducing OpenClaw session rollover.
