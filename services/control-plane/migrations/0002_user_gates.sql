-- Migration 0002 — control_plane.user_gates (gates domain, issue #26).
--
-- Cross-client Pre-Chat Gate completion, one row per User. We store a nullable
-- completion timestamp per gate rather than an event log: the gate is "done"
-- iff its timestamp is set, and recording is idempotent (set-if-null via
-- COALESCE, see repo/user-gates.ts) so the first-completion time is preserved
-- on a re-record. Device-local gates (capture permission, #27) are not here —
-- they are not cross-client state.
--
-- `user_id` is both the PK and a FK into control_plane.users(id): gate state
-- only exists for a known User, and recording for an unknown id fails the FK.
--
-- Ownership mirrors 0001_users.sql: written by #26, applied to production by #50
-- (which holds Neon admin and provisions the control_plane schema + role). This
-- migration only creates its own table, always inside control_plane. See
-- migrations/README.md.

CREATE TABLE IF NOT EXISTS control_plane.user_gates (
  user_id              uuid        PRIMARY KEY REFERENCES control_plane.users(id),
  consent_completed_at timestamptz,
  sibling_skip_at      timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
