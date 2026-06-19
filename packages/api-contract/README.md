# @intentive/api-contract

The Control Plane's HTTP API contract. See [`packages/CONTEXT.md`](../CONTEXT.md) → **Internal API** (and the Control Plane's own [`CONTEXT.md`](../../services/control-plane/CONTEXT.md) → **Control Plane**).

Two surfaces:

- **Public** — what clients call (`GET /me`, `POST /consent`, `POST /devices/register` with optional `expo_push_token`, etc.). JWT-authenticated.
- **Internal** — what the Agent Runtime calls (`POST /internal/sessions/start`, `POST /internal/notifications/push`). Shared-secret authenticated, private network only.
- **Maintenance** — what operators/schedulers call (`POST /internal/notifications/check-receipts`). Separate shared-secret auth.
