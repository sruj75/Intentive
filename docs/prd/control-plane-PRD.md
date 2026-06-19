# Control Plane V1

Status: ready-for-agent
Labels: ready-for-agent
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Problem Statement

Every Client and the Agent Runtime already assume a working **Control Plane**, but it is still only a scaffold (`services/control-plane/src/index.ts` is a contract sample). Mobile's Entry Resolver (#01), Consent Primer (#03), Protocol client Routing (#06), and Account Surface (#09) all call Control Plane endpoints. Desktop's Routing + WebSocket session state (#11) calls `GET /agent`. Agent Runtime's WebSocket gateway (#03) depends on **Session Start** being driven by Control Plane, and Post-Message-Back (#11) depends on Control Plane's push fan-out. None of this work has a tracker, so the server-side authority that ties the four deployables together is an unplanned blind spot.

The User-facing problem is that without the Control Plane there is no identity, no cross-client gate state, no way for a signed-in Client to discover its Agent Runtime, and no path for a deliberate Post-Message-Back to reach a device as a Push Notification.

## Solution

Build the Control Plane as a stateless Node/TypeScript HTTP service deployed to **Google Cloud Run**. It is the server-side authority for identity, the Device Registry, Pre-Chat Gate state, the Agent Instance Registry, Routing, and notification fan-out. It sits **beside** the client↔runtime data path and never **on** it: it issues Routing once (`GET /agent` → URL + JWT) and then steps out.

Request/response schemas are owned by `packages/api-contract/`; the Control Plane implements them, it does not redefine them. JWT verification reuses the shared `packages/providers/` auth boundary (Neon Auth JWKS), the same boundary the Agent Runtime uses. The Control Plane reads a control-plane-owned Neon schema, separate from the Runtime-owned schema. It holds Expo Push Tokens and the push-delivery side of the Device Registry; the Agent Runtime never calls Expo, APNs, or FCM directly.

## User Stories

1. As a User, I want to sign in once with Neon Auth and have every Client recognize me, so that I do not re-onboard per device.
2. As a User, I want Identity Gate and Consent Primer completed on one device to be remembered everywhere, so that a sibling Client does not re-prompt me.
3. As a Mobile Client, I want `GET /me` to tell me the next Pre-Chat Gate or that I can enter Companion Chat, so that my Entry Resolver is server-driven.
4. As a Desktop Client, I want `GET /me` to require Capture Permission Setup as a Device-Local Gate even though I am already onboarded, so that capture is correctly gated per device.
5. As a Client, I want `GET /agent` to return `ws_url`, `runtime_jwt`, and `agent_instance_id`, so that I can open one direct Protocol WebSocket to the Agent Runtime.
6. As a Client, I want device registration to be idempotent and to carry my Expo Push Token, so that push delivery can reach me without duplicate device rows.
7. As the Control Plane, I want to call the Agent Runtime's `POST /internal/sessions/start` exactly once per first chat entry, so that the Agent Instance is created or loaded idempotently.
8. As the Agent Runtime, I want to call `POST /internal/notifications/push` on the Control Plane when a User is offline, so that push delivery stays in one authority.
9. As an operator, I want the Control Plane to deploy to Cloud Run with the same shared-secret and Neon configuration as the Runtime expects, so that the Internal API trust boundary works in production.

## Implementation Decisions

- Stateless HTTP request/response only in v1. Deploys to Google Cloud Run.
- Domains live under `src/domains/<name>/{types,config,repo,service,runtime,ui}/`: `identity`, `devices`, `gates`, `agents`, `routing`, `notifications`.
- Request/response schemas are imported from `packages/api-contract/`. The Control Plane never redefines wire shapes.
- User JWTs are verified through the shared `packages/providers/` auth boundary (Neon Auth JWKS) — the same verifier the Agent Runtime uses. This is a hard dependency on the shared contracts/providers work.
- The Control Plane reads a control-plane-owned Neon schema with a role separate from the Agent Runtime's schema.
- `GET /agent` mints the runtime JWT and returns Routing; the Control Plane is never on the message data path afterward.
- Session Start is the only Control Plane → Agent Runtime call that creates state. It is synchronous and idempotent per User.
- The Control Plane holds Expo Push Tokens and sends through Expo Push Service. The Agent Runtime asks it to push; it never pushes directly.
- All write endpoints that represent a one-time lifecycle transition are idempotent.
- The GCP Provisioner is removed from v1. Agent Instance Creation is synchronous; there is no per-user provisioning lifecycle.

## Out of Scope

- Proxying or inspecting any in-session client↔runtime message.
- Apple Sign-In (Google only in v1; Apple later).
- Per-user VM / per-user process / per-user schema / org / workspace / `tenant_id`.
- Direct APNs/FCM delivery and Android-specific push delivery.
- Any chat, conversation history, or agent behavior — those are Agent Runtime concerns.

## Further Notes

- Control Plane ADR-0001 records Control Plane as source of truth. mobile ADR-0007 records the shared Control Plane for Client Apps. desktop ADR-0010 and mobile ADR-0006 cover Neon Auth.
- Endpoints and domains are described in `services/control-plane/README.md` and `services/control-plane/AGENTS.md`.
- Cross-cutting contract and Providers work (which this tracker depends on) is tracked on GitHub with the `SHARED` label; see `docs/ISSUE-BOARD.md` and `docs/prd/shared-contracts-PRD.md`.

## Comments
