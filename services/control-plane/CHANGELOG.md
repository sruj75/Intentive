# Changelog

All notable changes to the Control Plane service. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this service will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Added

- **Device Registry + device-aware gates** ([Issue #27]) — `devices` domain with
  idempotent `POST /devices/register` (upsert keyed `UNIQUE(user_id,
device_fingerprint)`, non-destructive APNs/FCM token rotation) and the token-free
  `devices.listDevicesForUser` read port, `migrations/0003_devices.sql`, and
  service/HTTP tests plus an opt-in `devices-repo.integration` tier. `GET /me` now
  carries a device/client signal (`X-Client-Kind`, `X-Capture-Permission-Granted`)
  so `computeNextGate` branches on `client_kind`: Mobile walks `consent → sibling`,
  Desktop appends the device-local `capture_permission_setup` gate (read live, never
  stored). The Sibling Invitation also auto-resolves when a sibling device is
  observed. See [ADR-0005](docs/adr/0005-device-aware-gates-from-live-signals.md).
- **Cross-client Pre-Chat Gates** ([Issue #26]) — `POST /consent` and
  `POST /sibling-invitation/skip` (idempotent cross-client writes), `gates` domain
  (`computeNextGate`, `GatesService.nextGate`, `control_plane.user_gates` repo),
  `migrations/0002_user_gates.sql`, and service/repo/HTTP tests
  (`gates-compute-next-gate`, `gates-service`, write-handler, and opt-in
  `user-gates-repo.integration` tiers). `GET /me` now returns a real `next_gate`
  for Consent Primer and Sibling Invitation sequencing.
- **Identity slice** ([Issue #23]) — `GET /me` with Neon Auth JWT verification,
  `control_plane.users` upsert repo, `identity.resolveAccount` composer,
  `src/main.ts` composition root (Hono), `migrations/0001_users.sql`, and
  service/repo/HTTP tests. Repo integration tests run against disposable Neon
  branches per [ADR-0003](docs/adr/0003-repo-tests-against-ephemeral-neon-branches.md)
  when `NEON_API_KEY` / `NEON_PROJECT_ID` are set.

### Changed

- **`AccountState` assembly** ([ADR-0004](docs/adr/0004-account-state-assembled-by-identity-composer.md),
  extended by [ADR-0005](docs/adr/0005-device-aware-gates-from-live-signals.md))
  — `identity.resolveAccount` is the sole assembler of the `GET /me` response and
  now also composes from `devices`: it derives `hasSiblingDevice` from
  `listDevicesForUser` and passes the device context into `gates.nextGate(userId,
device)`. `gates` gains no dependency on `devices` (the composer does the
  cross-domain read); `computeNextGate` stays a pure function. `has_agent_instance`
  remains an honest `false` placeholder until [Issue #30].
- **`ARCHITECTURE.md`** — moved to the deployable root (`services/control-plane/ARCHITECTURE.md`);
  codemap and domain responsibilities updated for the identity composer and gates seam.

[Issue #23]: https://github.com/sruj75/Intentive/issues/23
[Issue #26]: https://github.com/sruj75/Intentive/issues/26
[Issue #27]: https://github.com/sruj75/Intentive/issues/27
[Issue #30]: https://github.com/sruj75/Intentive/issues/30
