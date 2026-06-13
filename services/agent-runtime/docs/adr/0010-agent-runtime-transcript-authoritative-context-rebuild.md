# ADR 0010: Transcript-Authoritative Context Rebuild; Checkpointer Is Mid-Turn Only

## Status

Superseded by ADR-0012

> **Superseded 2026-06-13.** This ADR made `conversation_messages` the model's
> authoritative memory and rebuilt the model context from it each turn, treating
> the LangGraph checkpointer as mid-turn-only. That fights two battle-tested
> DeepAgents/LangGraph mechanisms (native thread carrying + summarization
> middleware) for a single-source-of-truth property we do not need, and it
> contradicts the pre-existing Persistence Adapter design. ADR-0012 adopts the
> DeepAgents-native two-tier model instead. Kept for history.

## Date

2026-06-13

## Context

The Agent Runtime is built on DeepAgents (LangChain/LangGraph). The standard
LangGraph pattern makes the **checkpointer** the durable long-term thread: a
`thread_id` accumulates the message list across turns and is the de-facto memory.
A future reader will assume that is how we work.

We deliberately do not. Per ADR-0001 we adopt OpenClaw's battle-tested shell
patterns by default and diverge only with explicit rationale. OpenClaw's session
model is a two-layer split: a small metadata **session store** (`sessions.json`)
plus an append-only **transcript** (`<sessionId>.jsonl`) that is the authoritative
record and is _"used to rebuild the model context for future turns."_ Compaction
in OpenClaw is itself a **persisted transcript entry** (`compaction` with
`firstKeptEntryId`); after it runs, future turns rebuild from "summary + messages
after that id."

This collides with the default LangGraph mental model, so it must be recorded.

## Decision

1. **`conversation_messages` (Neon) is the single source of truth** for the
   conversation — the analog of OpenClaw's authoritative transcript.

2. **The model's working context is rebuilt from `conversation_messages` each
   turn** (a bounded recent window plus any persisted compaction summary). There
   is no second long-lived LangGraph thread that holds the real memory.

3. **The LangGraph checkpointer is mid-turn only** — resumability for a
   half-finished tool sequence within a single turn, managed by the Persistence
   Adapter (see `CONTEXT.md`). It is not the cross-turn memory.

4. **Compaction summaries are persisted by the shell.** DeepAgents'
   summarization middleware may produce the summary, but the shell durably
   persists it into the Runtime's own store so per-turn rebuilds keep seeing it.
   A summary living only in ephemeral thread state would break the
   rebuild-from-transcript property. Intentive owns retention policy and what
   stays durable.

This is the per-deployable mapping of OpenClaw's two-layer model onto
LangGraph/Neon: transcript → `conversation_messages`; `sessions.json` metadata →
`agent_instances`/`runtime_turns`; the checkpointer fills the mid-turn slot
OpenClaw handles by appending to the transcript.

## Consequences

### Positive

- One clear source of truth; "what did the model see on turn N?" is answerable
  from `conversation_messages` — strong for the Langfuse eval/replay loop.
- Reconnect already works: the Session Snapshot reads `conversation_messages`
  (ADR-0006), and that is the same store the turn rebuilds from.
- The checkpointer stays swappable (Persistence Adapter), uncoupled from being
  the conversation's memory.

### Negative

- Intentive owns per-turn context-window assembly rather than getting it
  implicitly from LangGraph thread state.
- Compaction requires an explicit persist-back step; it is not free middleware.

### Neutral / Follow-up

- Exact compaction trigger, summary shape, and retention policy are a later
  phase (Phase 11) and may warrant their own ADR.
- Session lifecycle (one continuous session per user vs OpenClaw-style
  daily/idle reset into a new `sessionId`) is resolved separately.
