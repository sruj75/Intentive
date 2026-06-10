# Session Snapshot Is a Separate History Projection, Not a Replay of Live Events

## Status

accepted — amended 2026-06-10 (see Amendment: backfill is built in v1)

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
- Extends monorepo ADR-0003 (single live protocol shape); the snapshot schema is the canonical, strict shape for `hello_ok.session_snapshot`.

## Amendment (2026-06-10): backfill is built in v1

The original decision (above) deferred the _pagination implementation_ — `before_cursor` was to ship as a forward-compatible "older history exists" flag with no way to fetch the older page in v1. #29 reverses that: the backfill request/response **and** its handler are built in #29, not deferred.

What changed the call:

- **The read interface generalizes cleanly.** The simplest interface covering both the initial load and the older-page fetch is one method with an optional cursor — `readSnapshot(userId, before?)` — where the older page is the same projection with `WHERE seq < cursor`. The deferred-pagination plan would instead have grown a second, special-purpose read method later, sharing the snapshot's knowledge across two shallow methods. Generalizing `readSnapshot` is the better design regardless, and once it exists, exposing it over the wire is a small step (per `software-design-philosophy`, "somewhat general-purpose").
- **The handler is self-testable today**, without a UI. Insert N messages, request the page before a cursor, assert the prior window and the next cursor — repo-tier, no client and no producer required. (Contrast the _live outbound delivery_ path, which is correctly deferred because it cannot be exercised without a `companion_message` producer — see #36/#41.)
- **It locks the whole history-read contract in one slice**, so Mobile hydration (#33/#44) can build cold-open _and_ scroll-back without waiting on a follow-up Agent Runtime slice.

Wire shape, deliberately reuse-heavy to minimise contract churn while there is no UI consumer yet to validate the shape:

- Client → Runtime: `history_backfill_request = { type, before_cursor: string, limit?: number }` — a cursor and an optional page size, nothing else.
- Runtime → Client: `history_backfill_response = { type, session_snapshot }`, embedding the **existing `session_snapshot` shape** (`{ messages: SessionMessage[], before_cursor }`) wholesale — exactly as `hello_ok` embeds it. A backfill page _is_ a snapshot positioned further back: same projection, same `SessionMessage`, same cursor semantics, no new _snapshot/message_ shape. The thin `type`-tagged envelope is required only because every Runtime → Client frame is a member of the `runtimeToClientEvent` discriminated union and so must carry a `type` discriminator; a bare `session_snapshot` object is not a sendable frame.

Ordering and cursor mechanics: a database-assigned monotonic sequence (`seq`) per appended message is the stable total sort order and the cursor basis; `at` (the server record time — not the client `sent_at`) is for display. `before_cursor` is the `seq` of the oldest message in the returned window, non-null when older history exists.

Scope note: backfill requests are **reads** — they do not enter the `runtime_events` ledger or write path. Their Session Snapshot reads are still submitted through the per-`user_id` ordering boundary, so a reconnect/backfill read waits behind earlier accepted work for that User while reads for other Users continue independently. What stays deferred is only the _client UI_ for scroll-back, not the server contract or handler.
