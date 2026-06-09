# Changelog

All notable changes to the Control Plane service. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this service will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Added

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

- **`AccountState` assembly** ([ADR-0004](docs/adr/0004-account-state-assembled-by-identity-composer.md))
  — `identity.resolveAccount` is the sole assembler of the `GET /me` response;
  `gates` exposes `nextGate(userId)`, not `/me` shaping. `has_agent_instance`
  remains an honest `false` placeholder until [Issue #30].
- **`ARCHITECTURE.md`** — moved to the deployable root (`services/control-plane/ARCHITECTURE.md`);
  codemap and domain responsibilities updated for the identity composer and gates seam.

[Issue #23]: https://github.com/sruj75/Intentive/issues/23
[Issue #26]: https://github.com/sruj75/Intentive/issues/26
[Issue #30]: https://github.com/sruj75/Intentive/issues/30
