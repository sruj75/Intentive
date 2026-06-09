-- Migration 0001 — control_plane.users (identity domain, issue #23).
--
-- The single source of account identity. One row per User, created the first
-- time a verified Neon Auth subject (`sub`) is seen and reused on every later
-- sign-in. We store only the stable internal `id` (the wire `user_id`) and the
-- `sub` we key on — never the IdP email/name (no such columns in v1; see
-- services/control-plane/CONTEXT.md and AGENTS.md).
--
-- `id` is the opaque principal handed to clients; `sub` (the IdP subject) stays
-- internal and is never leaked as the public id. The UNIQUE(sub) constraint is
-- what makes create-or-resolve idempotent: a second sign-in for the same `sub`
-- can only ever map back to the one existing row.
--
-- Ownership: this file is written by #23 and applied to production by #50, which
-- holds Neon admin access and provisions the `control_plane` schema + the
-- `control_plane_app` role/grants. This migration only creates its own table,
-- always inside the `control_plane` schema. See migrations/README.md.

CREATE TABLE IF NOT EXISTS control_plane.users (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sub        text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
