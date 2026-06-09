# Control Plane Migrations

SQL migrations for the control-plane-owned Neon schema.

## Convention

- One file per migration, named `NNNN_short_description.sql` (zero-padded, sequential).
- Every table, index, and constraint is created **inside the `control_plane` schema** (e.g. `CREATE TABLE control_plane.users (...)`). Never the `public` schema, never the Agent Runtime's schema.
- Migrations are owned by the domain that introduces the table: `users` → #23, gate state → #26, `devices` → #27, the Agent Instance Registry → #30.
- Migrations are **applied by #50** (Cloud Run deploy + provisioning), which holds Neon admin access and also creates the `control_plane` schema namespace and the `control_plane_app` role + grants. See [`../ARCHITECTURE.md`](../ARCHITECTURE.md) → Neon boundary.

## Migrations

- `0001_users.sql` — `control_plane.users` (identity, #23).
- `0002_user_gates.sql` — `control_plane.user_gates` (cross-client gate completion, #26).

## Scope note

Migrations here are authored by the owning behavior issue but are **applied by #50**,
which provisions the `control_plane` schema and the `control_plane_app` role. Each
file creates only its own objects, always inside the `control_plane` schema. The
repo-layer test that proves a migration runs against a disposable Neon branch
(control-plane ADR-0003) bootstraps the schema itself, so it never depends on #50.
