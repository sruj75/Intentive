# @intentive/api-contract

The Control Plane's HTTP API contract. See [`docs/CONTEXT.md`](../../docs/CONTEXT.md) → **Control Plane** and **Internal API**.

Two surfaces:
- **Public** — what clients call (`GET /me`, `POST /consent`, etc.). JWT-authenticated.
- **Internal** — what the Agent Runtime calls (`POST /internal/sessions/start`, `POST /internal/notifications/push`). Shared-secret authenticated, private network only.
