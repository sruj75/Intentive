# Store Context Snapshots locally before pushing

Intentive writes each Context Snapshot to a local SQLite table before pushing to the OpenClaw Agent. This is not a cache — it is the primary record of what was captured and sent, enabling a future transparency UI ("see what Intentive captured") and providing an audit trail that privacy guardrails are functioning correctly.

Fire-and-forget was rejected because transparency to the user requires a local receipt of what was sent.

## Schema

Table: `snapshots`
- `id` TEXT PRIMARY KEY
- `captured_at` TEXT (ISO8601)
- `period_start` TEXT (ISO8601)
- `period_end` TEXT (ISO8601)
- `summary` TEXT
- `pushed_at` TEXT (ISO8601, nullable — null if push failed)

## Consequences

- Write locally first, then push. Local record exists regardless of push success.
- Default retention: 7 days. Entries older than 7 days are purged automatically.
- Privacy guardrails are applied at LLM summarization time (prompt constraints), not at the storage layer. The local log stores the already-sanitized summary, not raw screen data.
- Future transparency UI reads directly from this local SQLite table.
