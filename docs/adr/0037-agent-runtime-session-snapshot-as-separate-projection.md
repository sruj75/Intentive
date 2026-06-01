# Session Snapshot Is a Separate History Projection, Not a Replay of Live Events

## Status

accepted

## Date

2026-05-29

## Context

`hello_ok.session_snapshot` in `packages/protocol` was typed `z.unknown()` — a placeholder. On reconnect (every Mobile cold open) the client must render the authoritative Conversation History timeline before any live events arrive, so this shape has to be defined before the gateway (Phase 2) and Conversation History (Phase 4) work begins, or the contract drifts mid-build.

The timeline is two-sided: Conversation History is "the complete record of messages between a User and their Companion" — both user-authored and companion-authored entries. The obvious shortcut is to reuse the live wire events (`user_message`, `companion_message`) inside the snapshot. But those events carry different timestamp fields (`sent_at` vs `emitted_at`), so the client would have to branch on type just to sort — and, more importantly, reusing them couples the live transport contract to the history-rendering contract.

## Decision

The snapshot carries a dedicated uniform shape, distinct from the live events:

```
SessionMessage = {
  message_id: string,
  author: "user" | "companion",
  body: string,
  at: string (datetime),            // one uniform sortable timestamp
  via_post_message_back: boolean    // always present; false for user-authored
}

session_snapshot = {
  messages: SessionMessage[],       // most recent N (default 50), oldest-first
  before_cursor: string | null      // non-null when older history exists
}
```

`SessionMessage` is a read projection of Conversation History, deliberately separate from the `user_message`/`companion_message` live wire events.

## Considered Options

- **Dedicated uniform `SessionMessage` projection (chosen).**
- **Reuse the live event shapes in the snapshot (rejected).** Forces type-branching to sort, and leaks the live transport contract into the history-rendering contract — a change to either ripples into the other.

## Consequences

- Live events (transport of a single moment — may grow delivery acks, sequence numbers, streaming chunks) and history rows (rendered record — may grow edited flags, reactions, read state) evolve on independent axes without coupling.
- A third "message" shape exists, justified because it hides a distinct design decision (how history renders) behind a simple, zero-branch render contract.
- `before_cursor` reserves room for backward pagination without committing to an infinite-scroll implementation in v1.
- Extends ADR-0035 (single live protocol shape); the snapshot schema is the canonical, strict shape for `hello_ok.session_snapshot`.
