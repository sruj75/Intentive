# Drop failed snapshot pushes in v1

When snapshot delivery to the Agent Runtime fails (network down, VM unavailable, timeout), Intentive discards the snapshot and continues. No retry, no local queue.

Persist-and-retry (store failed snapshots to disk, replay when connectivity restores) is the correct long-term behavior but adds meaningful complexity for a v1 infrastructure build. Acceptable data loss during outages is a deliberate v1 trade-off.

## Consequences

- No retry logic needed in v1 — fire and forget
- Delivery success means **accepted into the live Protocol WebSocket session**, not confirmed receipt — the Protocol defines no Runtime→Client ack for `context_snapshot` (its `delivery_ack` is `message_id`-keyed, Mobile→Runtime, for chat). `pushed_at` is stamped on socket-write; a frame the Runtime silently drops is lost like any other failure.
- A failed emit leaves `pushed_at` null and the snapshot is **not** re-sent on a later heartbeat — each tick emits only its freshly-produced snapshot. Null rows persist only until the 7-day retention purge.
- `session_end_marker` follows the same at-most-once rule. The Desktop only guarantees ordering (final snapshot → marker → socket teardown, on a still-open socket); a lost marker is not retried, so Runtime liveness must self-correct rather than trust the marker as guaranteed.
- Snapshots produced during internet outages or GCP downtime are permanently lost
- Future upgrade path: persist failed snapshots to a local queue (SQLite table), replay on reconnect
