# Changelog

All notable changes to the Control Plane service. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this service will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Added

- **Routing + Agent Instance Registry + Session Start** ([Issue #30]) —
  `agents` domain with idempotent `control_plane.agent_instances` registry
  (`migrations/0004_agent_instances.sql`, one row per `user_id`), Runtime Session
  Start client (`POST /internal/sessions/start` via Directional Secret), and
  `AgentsService.ensureAgentInstance` / `hasAgentInstance`. `GET /agent`
  (`routing/ui/get-agent.ts`) authenticates with the same Neon Auth bearer path as
  `/me`, enforces gate satisfaction server-side (`403 gate_required`), calls Session
  Start on every request (live `ws_url`; registry stores only `agent_instance_id`),
  and returns `GetAgentResponse` with the **pass-through** Neon Auth `runtime_jwt`
  (ADR-0002 — never CP-signed). Retryable `503 service_unavailable` when JWKS or
  Session Start is unreachable. `identity.resolveAccount` now reads
  `has_agent_instance` from the injected agents read port. Tests:
  `test/agent-instances-repo.integration.test.mjs`, `test/agents-service.test.mjs`,
  `test/runtime-session-start.test.mjs`, `test/get-agent-handler.test.mjs`, plus
  extended `app.test.mjs` and `identity-service.test.mjs`.
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

- **HTTP auth boundary consolidation** — the authenticated-request decision for every
  public endpoint (`GET /me`, `GET /agent`, `POST /consent`, `POST /sibling-invitation/skip`,
  `POST /devices/register`) now lives once in `src/http/auth.ts` (`requireUser`,
  `bearerToken`, `authFailed`, `serviceUnavailable`, `mapJwtVerificationErrorToHttpResponse`).
  Resolves drift where `get-agent` and identity handlers returned different `503` bodies for
  JWKS outages. **Removed** per-domain copies in `identity/ui/require-user.ts` and
  `identity/service/auth-failure.ts`. HTTP-status mapping stays service-local (the Agent Runtime
  maps the same `JwtVerificationFailure` to protocol events, not statuses). Tests:
  `test/http-auth.test.mjs`; duplicated auth-failure cases thinned in handler tests.
- **Device-signal header boundary** — `GET /me` and `GET /agent` both read the identical
  optional device signal (`X-Client-Kind`, `X-Capture-Permission-Granted`) through
  `src/http/device-signal.ts` (`readDeviceSignal`); malformed headers degrade to no signal
  (cross-client-only gate sequence) rather than `400`. Tests: `test/http-device-signal.test.mjs`.
- **Shared SQL port** — every domain `repo` imports the one `Sql` tagged-template interface from
  `src/db/sql.ts` instead of restating it; keeps the Neon driver out of unit-tier module graphs.
- **`AccountState` assembly** ([ADR-0004](docs/adr/0004-account-state-assembled-by-identity-composer.md),
  extended by [ADR-0005](docs/adr/0005-device-aware-gates-from-live-signals.md))
  — `identity.resolveAccount` is the sole assembler of the `GET /me` response and
  now also composes from `devices`: it derives `hasSiblingDevice` from
  `listDevicesForUser` and passes the device context into `gates.nextGate(userId,
device)`. `gates` gains no dependency on `devices` (the composer does the
  cross-domain read); `computeNextGate` stays a pure function. [Issue #30] wires
  the third composer collaborator (`agents.hasAgentInstance`) so
  `has_agent_instance` reflects the Agent Instance Registry.
- **`src/main.ts` composition root** ([Issue #30]) — wires `agentInstances` repo,
  Runtime Session Start client, `agents` service, and `GET /agent` handler; identity
  receives the narrow agents read port only (no Session Start dependency cycle).
- **`ARCHITECTURE.md`** — moved to the deployable root (`services/control-plane/ARCHITECTURE.md`);
  codemap and domain responsibilities updated for the identity composer and gates seam.

[Issue #23]: https://github.com/sruj75/Intentive/issues/23
[Issue #26]: https://github.com/sruj75/Intentive/issues/26
[Issue #27]: https://github.com/sruj75/Intentive/issues/27
[Issue #30]: https://github.com/sruj75/Intentive/issues/30
