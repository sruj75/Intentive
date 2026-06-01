# ADR 0003: Single Live Protocol Shape (v1)

## Status
Accepted

## Date
2026-05-28

## Context

The monorepo ships first-party clients and runtime together. Keeping backward-compat wire aliases and protocol negotiation fields inside `packages/protocol/` increased ambiguity, encouraged legacy naming drift, and made strict contract enforcement harder.

## Decision

Adopt a single-live contract policy for v1 shared wire schemas:

1. `packages/protocol/` exports only canonical schema names. Backward-compat alias exports are removed.
2. `connect` no longer negotiates via `min_protocol`/`max_protocol`; required fields are `auth_token`, `client_kind`, `client_version`.
3. `hello_ok` carries only success shape (`type`, `session_snapshot`), with no `negotiated_protocol` field.
4. Runtime protocol failures use one dedicated `runtime_error` envelope with:
   - `type: "runtime_error"`
   - `code` in (`protocol_unsupported`, `auth_failed`, `invalid_connect`)
   - `message`
   - optional `details`
5. All wire object schemas in `packages/protocol/` and `packages/api-contract/` are strict; unknown keys are rejected.
6. First-party desktop transport-facing names align to canonical wire language (`snapshot_id`, `ended_at`, `reason`) with no compatibility rename layer.

## Consequences

### Positive

- One unambiguous wire contract for all first-party deployables.
- Lower cognitive load: no negotiation branch, no alias surface, no hidden translation layer.
- Stronger regression safety via strict parsing and canonical naming.

### Negative

- This is intentionally breaking for any stale consumers that still send/read legacy fields.
- Multi-version compatibility windows are explicitly out of scope for v1.

### Follow-up

- If mixed-version rollout becomes required later, introduce it as a new ADR with explicit migration policy instead of reintroducing aliases ad hoc.
