-- Migration 0005 — index runtime_events for the Sensory Buffer "latest perception" read (issue #38).
--
-- `createSensoryBufferReader.readLatest` runs on every Interactive Turn (via
-- `readRecentPerception`): it filters `runtime_events` by (user_id, kind) and
-- takes the single newest row by `created_at DESC`. The only pre-existing index
-- is UNIQUE (user_id, kind, dedup_key) — ordered by dedup_key, not time — so the
-- planner matches every perception row for the User and then sorts the whole set
-- on each turn. Since a context_snapshot accumulates roughly every 10 min per
-- active User, that matched set grows unbounded with retention and the per-turn
-- sort cost grows with it.
--
-- This mirrors `runtime_turns_user_created_at` (migration 0003), which gave the
-- analogous "latest by created_at" query a dedicated index. The index lets the
-- planner walk newest-first and stop at the first matching row instead of
-- sorting.

CREATE INDEX IF NOT EXISTS runtime_events_user_created_at
  ON agent_runtime.runtime_events (user_id, created_at DESC);
