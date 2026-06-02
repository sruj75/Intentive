# Control Plane Migrations

SQL migrations for the control-plane-owned Neon schema.

## Convention

- One file per migration, named `NNNN_short_description.sql` (zero-padded, sequential).
- Every table, index, and constraint is created **inside the `control_plane` schema** (e.g. `CREATE TABLE control_plane.users (...)`). Never the `public` schema, never the Agent Runtime's schema.
- Migrations are owned by the domain that introduces the table: `users` → #23, gate state → #26, `devices` → #27, the Agent Instance Registry → #30.
- Migrations are **applied by #50** (Cloud Run deploy + provisioning), which holds Neon admin access and also creates the `control_plane` schema namespace and the `control_plane_app` role + grants. See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) → Neon boundary.

## Scope note

This directory establishes the convention only. No `.sql` files exist yet and no migration runs as part of #17 (contracts + scaffolds) — that issue is behavior-free.
