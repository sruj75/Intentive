# @intentive/api-contract Architecture

This is the package-local architecture contract for `packages/api-contract/`. It extends the monorepo-wide rules in `../../docs/ARCHITECTURE.md` and the vocabulary in `../../docs/CONTEXT.md` → **Control Plane** and **Internal API**.

## Purpose

The single source of truth for the **Control Plane's HTTP contract** — request and response bodies as Zod schemas. Clients import the public surface; the Control Plane implements both surfaces; the Agent Runtime imports the internal surface it calls and receives. No deployable redefines a request/response shape.

## Current surface

Defined in `src/index.ts`, two surfaces:

- **Public API (Client → Control Plane), JWT-authenticated:**
  - `GET /me` → `AccountState` (`user_id`, `next_gate`, `has_agent_instance`).
  - `GET /agent` → `GetAgentResponse` (`agent_instance_id`, `ws_url`, `runtime_jwt`).
  - `POST /consent`, `POST /sibling-invitation/skip` → one-time lifecycle acknowledgements.
  - `POST /devices/register` → device fingerprint + `client_kind` + APNs/FCM token, returns `device_id`.
- **Internal API (Control Plane ↔ Agent Runtime), shared-secret authenticated, private network:**
  - `POST /internal/sessions/start` — Control Plane → Runtime: Session Start, returns `agent_instance_id` + `ws_url`.
  - `POST /internal/notifications/push` — Runtime → Control Plane: push handoff, returns `delivered` + `device_count`.
- **Shared primitives** — `ClientKind`, `PreChatGateKind` (`identity | consent_primer | capture_permission_setup | sibling_client_invitation`).

## Invariants

- Every Control Plane HTTP body is a Zod schema here; the Control Plane and Clients implement these shapes, they do not redefine them.
- The public surface is JWT-authenticated; the internal surface is shared-secret authenticated and private-network only. The two are never conflated.
- This package contains schemas and types only — no route handlers, no auth logic, no I/O.
- Routing (`runtime_jwt`, `ws_url`) is returned once via `GET /agent`; nothing here proxies in-session messages.

## Boundaries

- **Consumers:** `apps/mobile` and `apps/desktop` (public surface, via their Control Plane HTTP provider); `services/control-plane` (both surfaces, as implementer); `services/agent-runtime` (internal surface — its `internal` domain).
- **Sibling contracts:** WebSocket events live in `@intentive/protocol`; non-wire domain shapes live in `@intentive/domain-types`.

## Change protocol

1. Add or change the Zod schema here first (inviolable: contract before implementation).
2. Run monorepo typecheck — the Control Plane implementation and every Client/Runtime caller are flagged.
3. Implement the change in `services/control-plane` and adjust callers.
4. Keep public vs internal separation intact; a new internal endpoint must stay off the public surface.
5. Check endpoint and field names against `../../docs/CONTEXT.md` vocabulary before merging.
