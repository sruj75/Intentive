# `GET /me` computes device-local and sibling gates from live client-reported signals and observed devices; the Control Plane stores no device-OS permission state

Status: accepted

`GET /me` returns the next Pre-Chat Gate for the **calling device**, not just the User. To do that it carries a device/client signal — `client_kind` (always) and `capture_permission_granted` (Desktop only) — as request headers, and `identity.resolveAccount` composes the gate inputs from three sources before calling `gates.computeNextGate`:

- cross-client completion (`consent`, `sibling-skip`) from the `gates` repo,
- the live request signal (`client_kind`, `capture_permission_granted`),
- `hasSiblingDevice` — derived by `resolveAccount` from `devices.listDevicesForUser(userId)` (a device of a different `client_kind` exists).

`computeNextGate` stays a pure function over those inputs: `consent_primer → (sibling: skip OR sibling-device) → (desktop-only: capture_permission_setup if not granted) → null`. Mobile walks `consent → sibling`; Desktop appends the device-local capture gate last.

Two deliberate, non-obvious choices:

1. **The capture gate is read live, never stored.** macOS Screen Recording permission is owned by the OS and revocable at any time in System Settings. The Control Plane stores **no** copy of it — the Desktop reports its current grant on each `GET /me`, and the gate is computed from that. There is no per-device gate-completion table and no record endpoint.
2. **The Sibling Invitation is satisfied by an observed device, composed at read time.** Connecting a sibling client (e.g. registering a Mac via `POST /devices/register`) clears the Mobile Sibling gate without any client writing "done" — `resolveAccount` observes the device and `computeNextGate` resolves it. The explicit "Not now" skip remains a second satisfaction path.

This extends [ADR-0004](0004-account-state-assembled-by-identity-composer.md): `resolveAccount` now also composes from `devices`. It does not move `/me` shaping into `gates` — `gates` gains no dependency on `devices`; the composer does the cross-domain read and passes pure inputs in.

**Considered Options**

- **Live-reported capture status, no stored device-OS state (chosen).** Honors capability-honesty: a server-stored copy of an OS permission drifts the moment the user revokes it, shipping a dishonest gate. Matches the battle-tested mobile pattern (clients check OS permission live each launch; persisting it server-side is a known stale-state anti-pattern). Respects single-writer: the Control Plane owns _account_ truth, not _device-OS_ truth. Smaller, too — deletes a per-device gate table, a record endpoint, and an idempotent write path. Cost: `GET /me` trusts a self-reported boolean, but a lying client only mis-gates itself.
- **Store capture-permission completion as a one-time onboarding milestone.** Simpler to reason about if the gate means only "first-run setup happened," but it can lie after revocation and adds storage + a write endpoint the live model avoids.
- **Sibling gate satisfied by a write at registration time** (devices calls into gates on Desktop registration). Rejected: it couples two domains' write paths, makes `devices` reach into gate storage, and duplicates a fact (device existence) as a separate gate record. Read-time composition keeps one source of truth per fact.

**Consequences**

- `GET /me` gains a device/client signal in `packages/api-contract` (`client_kind`, `capture_permission_granted` headers). The `AccountState` _response_ shape is unchanged at acceptance time — `next_gate` already includes `capture_permission_setup`. #47 later added `has_desktop_client` (derived from the same device enumeration; not a gate field).
- `gates.nextGate` grows from `(userId)` to take the composer-supplied device context; the only caller is `resolveAccount`.
- Every `GET /me` now reads `user_gates` **and** enumerates the user's devices (both indexed by `user_id`). Acceptable on the stateless hot path.
- `#32` (Desktop Capture Permission Setup) is a pure client integration against this contract: detect the macOS grant live, send `client_kind` + `capture_permission_granted`, drive the user to System Settings. No Control Plane gate code lives in `#32`.
- Device-token storage and fan-out are unaffected; the token-bearing read and dead-token reaping land with the send path in `#49`.
