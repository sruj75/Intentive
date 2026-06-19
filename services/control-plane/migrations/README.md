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
- `0003_devices.sql` — `control_plane.devices` (Device Registry + Expo Push Token, #27/#49).
- `0004_agent_instances.sql` — `control_plane.agent_instances` (Agent Instance Registry, #30).
- `0005_notification_tickets.sql` — `control_plane.notification_tickets` (Expo Push receipt checks, #49).

## Apply command

```bash
DATABASE_URL="<pooled Neon branch URL>" pnpm --filter ./services/control-plane migrate
```

The command creates `control_plane` if needed, applies every `*.sql` file in order, and never prints the connection URL. The PR Neon workflow uses the create-branch action's pooled URL for its preview branch. Repo integration tests create their own throwaway branches and fetch pooled URLs through Neon's connection URI API. Production provisioning still owns role creation and grants separately from table migrations.

## Scope note

Migrations here are authored by the owning behavior issue but are **applied by #50**,
which provisions the `control_plane` schema and the `control_plane_app` role. Each
file creates only its own objects, always inside the `control_plane` schema. The
repo-layer test that proves a migration runs against a disposable Neon branch
(control-plane ADR-0003) bootstraps the schema itself, so it never depends on #50.
