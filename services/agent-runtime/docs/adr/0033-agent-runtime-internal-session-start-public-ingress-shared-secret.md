# ADR 0033: The internal Session Start endpoint runs on public ingress behind a shared secret, not a private network path

## Status

Accepted. Pairs with ADR-0032 (GCE deploy). Mirrors the Control Plane's ADR-0008 for the opposite direction of the same server-to-server hop.

## Context

The Control Plane (stateless, on Cloud Run) calls the Agent Runtime's `POST /internal/sessions/start` (port `:8081`, guarded by `INTERNAL_SECRET_FROM_CONTROL_PLANE`) to start a session. Earlier `ARCHITECTURE.md` Security wording said internal HTTP runs "on a **private network path**." That overstated the isolation: **Cloud Run has no fixed egress IP**, so the VM cannot firewall-allow "the Control Plane's address" without standing up a VPC connector + firewall on the VM side — the same infra ADR-0007/0008 declined for v1.

The blast radius is small. `POST /internal/sessions/start` only does `registry.loadOrCreate({ userId, authSubject })` and returns an instance id plus the (already-public) WebSocket URL. A leaked secret lets an attacker create an **empty agent-instance row** — it cannot read a conversation, send a message, or impersonate a user.

## Decision

The internal Session Start endpoint is reachable over **public ingress**, routed through the same External HTTPS Load Balancer on an **`/internal/*` path** (so it gets TLS and the VM exposes no extra port), and protected by the `INTERNAL_SECRET_FROM_CONTROL_PLANE` bearer token (`timingSafeEqual`, checked before any side-effecting parse). It is **not** network-isolated. The `ARCHITECTURE.md` "private network path" wording is corrected to match.

## Considered Options

- **Shared secret over public ingress, via the LB `/internal` path (chosen).** Zero infra beyond the LB already added in ADR-0032; symmetric with the Control Plane's own inbound choice (ADR-0008). Worst case on leak: a junk session row.
- **Real private path via a VPC connector + VM firewall (rejected for v1).** Genuine isolation, but it is the exact infra ADR-0007/0008 declined, for a call whose blast radius is "made an empty row." This is the deliberate future reversal — earned by the internal surface ever carrying something more sensitive than "start a session," and recorded as its own ADR when taken.

## Consequences

- `INTERNAL_SECRET_FROM_CONTROL_PLANE` is a real secret (Secret Manager, rotatable) — it is the only thing between the public internet and Session Start.
- The Runtime's _outbound_ call to the Control Plane (`POST /internal/notifications/push`, guarded by `INTERNAL_SECRET_TO_CONTROL_PLANE`) reaches the Control Plane's own public-ingress internal endpoint (ADR-0008) — the two directions are symmetric.
- If Session Start ever grows teeth (anything beyond creating/loading an instance row), revisit VPC isolation under a new ADR.
