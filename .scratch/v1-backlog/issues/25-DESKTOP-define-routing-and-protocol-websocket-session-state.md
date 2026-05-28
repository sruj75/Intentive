# Define Routing and Protocol WebSocket session state

Status: open
Labels: enhancement, ready-for-agent
Deployable: desktop
Opened: 2026-05-20T11:10:49Z
Updated: 2026-05-27T00:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/desktop-PRD.md

## What to build

Define the **Desktop Client** state that connects a signed-in **User** to the **Agent Runtime** without manual endpoint or API-key fields in Settings.

After **Neon Auth** sign-in, the app calls the **Control Plane** `GET /agent` (see `packages/api-contract/`) to obtain **Routing**: `ws_url`, `runtime_jwt`, and `agent_instance_id`. It opens one long-lived **Protocol** WebSocket to the **Agent Runtime**, authenticating with the JWT once at connect. **Control Plane** is not on the data path after Routing is resolved.

This issue establishes the local app state and interfaces that snapshot delivery (#28), smoke (#29), and verification (#37) consume — without exposing `ws_url` or tokens in the Settings UI.

It also corrects legacy Settings/sign-in copy from closed slices (e.g. references to OpenClaw Agent or manual agent connection configuration) so account surfaces match `docs/CONTEXT.md`.

## Acceptance criteria

- [ ] Define the Auth + Routing state model for at least `signed_out`, `signed_in`, `routing_ready`, and `routing_error`.
- [ ] Define the signed-in Neon user shape needed by the UI (minimal identity fields for Account/Settings).
- [ ] Define the resolved Routing shape (`ws_url`, `runtime_jwt`, `agent_instance_id`) consumed internally by the Protocol WebSocket client.
- [ ] The app distinguishes "signed in" from "ready to emit snapshots" when Routing is missing, expired, or invalid.
- [ ] Settings never exposes endpoint URL, API key, or raw JWT fields; Routing is resolved behind Auth.
- [ ] Settings and sign-in copy use current vocabulary (**Intentive**, **Companion**, **Routing**, **Agent Runtime** where appropriate) and do not mention OpenClaw Agent, Agent Interface, endpoint URLs, API keys, or legacy manual connection configuration.
- [ ] Protocol WebSocket session lifecycle is defined: connect on `routing_ready`, reconnect on drop with fresh Routing when needed, surface `routing_error` safely without crashing capture.
- [ ] Provide a stub or fixture path so #28–#37 can develop against resolved Routing before production Control Plane is wired.
- [ ] Document where this state lives and how #29 obtains it for smoke.
- [ ] Tests or a documented smoke check cover `signed_out`, `signed_in` without Routing, `routing_ready`, and `routing_error`.

## Blocked by

- #04

## Unblocks

- #28
- #29
- #37

## Notes

Successor to the legacy auth-resolved endpoint configuration scope. Configuration is **Routing** + **Protocol** session state, not a user-entered endpoint.

## Comments

### 01 @alignment — 2026-05-27T00:00:00Z

Rewritten to match `docs/CONTEXT.md`: **Control Plane** issues **Routing** once; **Desktop Client** speaks **Protocol** on WebSocket to **Agent Runtime** — no Neon Data API agent-connection reads and no legacy HTTP delivery path.
