# ADR-0009: Agent Runtime Transactional Ingress Projections

## Status

Accepted.

## Context

Runtime ingress writes two durable facts for a user-authored message:

- the `runtime_events` arrival marker, which is the idempotency gate
- the `conversation_messages` transcript projection, which reconnect snapshots read

Writing the marker before the projection creates a dual-write hazard. If the marker commits and the
projection fails, a retry sees the marker as a duplicate and skips the projection permanently.

## Decision

The ledger marker and every durable projection for an ingress event commit in one Neon array
transaction. Domain repos expose composable insert queries:

- `eventLedger.recordQuery(record)`
- `conversation.appendQuery(entry)`

The `sessions` and `conversation` domains do not import each other or know each other's tables. The
projection is injected as a `project` callback, and the composition root is the only place that
supplies it — so the two domains' writes meet without either depending on the other.

Per-user ordering still wraps the transaction, so the ledger insert and durable projection are
serialized together.

### Amendment (2026-06-11): the commit lives inside the Per-User Channel

The transaction commit now lives inside the **Per-User Channel** (`sessions/runtime/per-user-channel.ts`),
not in the composition root. The Channel owns the in-memory ordering queue (ADR-0007) and is the single
per-`user_id` serialization point: its `accept` builds the ledger record and commits
`[ledger.recordQuery(record), ...project(session, event)]` in one array transaction, and its
`readSnapshot` runs through the same queue so reconnect/backfill reads observe earlier accepted writes
(ADR-0006 amendment).

The decoupling this ADR protects is preserved: `project` is still injected by the composition root and
the Channel never imports the `conversation` repo — it depends only on `conversation/types`'
`SessionSnapshotReader` port and the injected `project` seam. Ordering, the transaction, and reads are
now co-located in one module (stronger locality) instead of being assembled from separate collaborators
in `main.ts`.

## Consequences

Durable projections are atomic with the idempotency marker: either all rows commit or none do.
Redelivery stays safe because both inserts remain `ON CONFLICT DO NOTHING`.

Async side effects are deliberately separate from this transaction. The future Companion loop and
Post-Message-Back delivery should run after the durable ingress commit and use their own retry model.
