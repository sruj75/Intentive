# Conversation History Is Its Own Domain, Split From `sessions` By Knowledge Not Storage-Family

## Status

accepted

## Date

2026-06-10

## Context

Phase 4 (#29) introduces the durable Conversation History transcript (`conversation_messages`) and the reconnect Session Snapshot projection (`readSnapshot`). It needs a home in the domain map. The obvious shortcut is to fold it into the existing `sessions` domain, because `sessions` already owns the other relational log — the append-only `runtime_events` idempotency ledger (#28) — and `CONTEXT.md` groups both under one heading, "the event / conversation log." Two tables, one storage family, one domain: tidy on the surface.

But "same storage family" is not "same design decision." A domain boundary in this service exists for two concrete reasons — to hide a design decision the rest of the system should not need to know about (managing complexity, per `software-design-philosophy` / Ousterhout), and to make that separation mechanically enforceable by the layer-direction lint. A box earns its place only if it hides a decision that varies _independently_ from its neighbours. So the question is not "is Conversation History important?" but "does it hide a decision that changes for different reasons than what `sessions` hides?"

`sessions` hides **how messages get ordered and de-duplicated**: the per-`user_id` in-memory queue, the single-process ordering assumption, the `(user_id, kind, dedup_key)` unique constraint, the arrival ledger shape. A `conversation` module hides **how the transcript renders**: the Session Snapshot projection — oldest-first windowing, the default-50 limit, `before_cursor` "older history exists" detection, the `author`/`at`/`via_post_message_back` row shape.

The leakage test decides it. Change the snapshot projection (new cursor encoding, read-receipts, a different window) — ordering/idempotency does not change. Change the ordering or idempotency strategy (a different dedup key, or someday a cross-process queue) — the transcript projection does not change. They change on different axes, for different reasons. That is the signature of two separate pieces of knowledge. The repo already made this exact call one layer up: ADR-0006 split `SessionMessage` (history projection) from the live `user_message`/`companion_message` wire events _because_ "how history renders" and "how a moment is transported" evolve independently. Splitting the storage the same way is that decision applied consistently.

## Decision

Conversation History is its own `conversation` domain, separate from `sessions`.

- `conversation` owns `conversation_messages` and exposes a deep, two-method interface: `append(message)` (write one timeline entry) and `readSnapshot(userId)` (the full Session Snapshot projection). `readSnapshot` hides real complexity — ordering, the default-50 window, and cursor detection — not a pass-through `SELECT`, so the boundary is deep, not classitis.
- `sessions` keeps `runtime_events`, the per-user queue, ordering, and idempotency. It stays describable in one sentence.
- The seam is one-directional and thin: the `sessions` queue processor, on a newly-recorded `user_message`, calls `conversation.append({ author: "user", … })`. The gateway connect handler reads history via an injected `readSnapshot` port. Neither domain reaches into the other's internals; `conversation` never hears about `runtime_events`. The independence is therefore enforced by the layer/boundary lint, not by convention.

**Tripwire, recorded deliberately:** the failure mode this split must avoid is _temporal decomposition_ — splitting by _when_ things happen (arrival-time vs read-time) instead of by _knowledge_. The smell is the `sessions` processor and the `conversation` writer sharing a growing blob of mapping logic (event shapes bleeding into the transcript writer, or vice versa). Today that translation is one line. If it ever grows fat, that is the signal we split on time rather than knowledge, and the two domains should merge back.

## Considered Options

- **Separate `conversation` domain (chosen).** Each domain hides an independently-varying decision; the boundary is deep; the lint protects the independence. Costs one more domain to wire and a one-line cross-domain `append` call.
- **Fold into `sessions` (rejected).** Tidy by storage-family, but makes `sessions` own two unrelated knowledge-areas — "ordering _and_ idempotency _and_ the readable transcript projection" — failing the one-sentence-per-module test, and leaving the lint unable to distinguish (and so unable to protect) the two axes. "Same storage family" was the only thing pulling toward this, and storage-family is not a module boundary.

## Consequences

- The "event / conversation log" grouping in `CONTEXT.md` is about **storage family** (both relational, both Neon, shell-owned), not module ownership. `CONTEXT.md` is updated to say so, so the cross-domain split is not surprising to the next reader.
- `conversation.append` is a shared capability built in #29 and reused later: #36 (DeepAgents) calls it once to persist a `companion_message`; #41 (Post-Message-Back) calls it plus push-handoff logic. Persistence-the-capability lives in `conversation`; the _moment_ of persisting a companion reply lives with its producer.
- Adding transcript behaviour later (companion side, read-state, backward pagination, edited flags) grows `conversation` without touching the ordering machinery in `sessions`.
- Extends the deployable's lazy-domain rule (ADR-0002): `conversation` is created now because #29 is the slice that gives it real behaviour.
