# Phase 3: Routing, Agent Instance Registry And Session Start

Status: ready-for-agent
Labels: ready-for-agent
Deployable: control-plane
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/control-plane-PRD.md

## What to build

Implement the `agents` and `routing` domains: `GET /agent` resolves **Routing** for a signed-in User by ensuring an **Agent Instance** exists (calling the Agent Runtime's `POST /internal/sessions/start`), minting the runtime JWT, and returning `agent_instance_id`, `ws_url`, and `runtime_jwt`. This is the keystone that unblocks Mobile #27, Desktop #25, and the Agent Runtime handshake (#19).

## Acceptance criteria

- [ ] `GET /agent` returns the `GetAgentResponse` shape from `packages/api-contract/` (`agent_instance_id`, `ws_url`, `runtime_jwt`).
- [ ] On first chat entry, the Control Plane calls the Agent Runtime `POST /internal/sessions/start` with shared-secret auth; the call creates or loads the Agent Instance and is idempotent per User.
- [ ] The Agent Instance Registry records one Agent Instance per User and reflects `has_agent_instance` back into `GET /me`.
- [ ] The runtime JWT is minted with the issuer/audience the Agent Runtime's Providers verifier expects, and is scoped to the User.
- [ ] After issuing Routing, the Control Plane is never on the message data path; no endpoint proxies or inspects in-session traffic.
- [ ] `GET /agent` requires a verified User and a satisfied gate state appropriate to the caller.
- [ ] Tests cover first-entry Session Start, idempotent repeat entry, runtime JWT claims, and the no-proxy guardrail.

## Blocked by

- #20
- #19

## Unblocks

- #27
- #25

## Comments
