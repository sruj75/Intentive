-- Migration 0004 — control_plane.agent_instances (agents domain, issue #30).
--
-- The Agent Instance Registry: the Control Plane's own record that a User has
-- *ever* provisioned a Companion. One row per User, keyed by the User id itself
-- (PRIMARY KEY user_id) — that PK is what makes get-or-create idempotent
-- (DB-enforced, like users.sub / devices' UNIQUE): a second Session Start for the
-- same User can only ever map back to the one existing row, never a duplicate.
--
-- We persist only the Runtime's `agent_instance_id`, never the `ws_url`: the
-- Agent Runtime owns its own address and may move, so Routing re-derives `ws_url`
-- from a live Session Start on every `GET /agent` rather than caching a stale one
-- here (service-discovery indirection; see service/agents-service.ts). The
-- registry answers exactly one local question — "has this User ever provisioned?"
-- — which is what `has_agent_instance` on `GET /me` reports.
--
-- `user_id` is a FK into control_plane.users(id): an instance only exists for a
-- known User, and recording one for an unknown id fails the FK.
--
-- Ownership mirrors 0001_users.sql / 0003_devices.sql: written by #30, applied to
-- production by #50 (which holds Neon admin and provisions the control_plane
-- schema + role). This migration only creates its own table, always inside
-- control_plane. See migrations/README.md.

CREATE TABLE IF NOT EXISTS control_plane.agent_instances (
  user_id           uuid        PRIMARY KEY REFERENCES control_plane.users(id),
  agent_instance_id text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
