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

The composition root commits the ledger marker and every durable projection for an ingress event in
one Neon array transaction. Domain repos expose composable insert queries:

- `eventLedger.recordQuery(record)`
- `conversation.appendQuery(entry)`

The `sessions` and `conversation` domains do not import each other or know each other's tables. The
composition root is the only place where their writes meet.

Per-user ordering still wraps the transaction with the user queue, so the ledger insert and durable
projection are serialized together.

## Consequences

Durable projections are atomic with the idempotency marker: either all rows commit or none do.
Redelivery stays safe because both inserts remain `ON CONFLICT DO NOTHING`.

Async side effects are deliberately separate from this transaction. The future Companion loop and
Post-Message-Back delivery should run after the durable ingress commit and use their own retry model.
