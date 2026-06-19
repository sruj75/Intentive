# Internal endpoints run on public ingress behind a shared secret, not network isolation

Status: accepted

The Control Plane's inbound internal endpoints — `POST /internal/notifications/push` (Agent Runtime → Control Plane) and `POST /internal/notifications/check-receipts` (maintenance) — are reachable over **public ingress** and protected by a **per-direction shared secret** (`INTERNAL_SECRET_FROM_RUNTIME`, `INTERNAL_SECRET_FOR_MAINTENANCE`), **not** by network isolation. This is a deliberate v1 choice. A Cloud Run service has one service-wide ingress setting; because the public client endpoints (`/me`, `/agent`, `/devices/register`) require `--allow-unauthenticated`, the `/internal/*` routes on the same service are necessarily on the public internet too. Earlier `ARCHITECTURE.md` wording that drew these as "private HTTP (VPC)" overstated the isolation and has been corrected to match this decision.

## Considered Options

- **Shared secret over public ingress (chosen).** A strong per-direction secret on a publicly reachable URL. The worst case if a secret leaked is triggering a push notification or a receipt-check — annoying, not data exposure or account takeover. This is the standard webhook-receiver pattern (e.g. Stripe-style webhooks).
- **Split into a separate internal-ingress Cloud Run service (or a load balancer doing path-based routing).** Real network isolation, but Cloud Run cannot make only _some_ paths private, so it requires a second service or fronting infrastructure — doubling the deploy surface for a notification-only internal surface. Rejected for v1.

## Consequences

- The two `INTERNAL_SECRET_*` inbound secrets are treated as real secrets (stored in Secret Manager, rotatable) — they are the only thing standing between the public internet and the internal surface.
- If the internal surface ever carries something more sensitive than "send a notification," network isolation should be revisited — that is a deliberate future reversal earning its own ADR, not a silent default.
- The CP → Agent Runtime _outbound_ call (`POST /internal/sessions/start`) is a separate concern governed by the Agent Runtime's own ingress and may use a VPC connector; this ADR is about the Control Plane's _inbound_ internal endpoints.
