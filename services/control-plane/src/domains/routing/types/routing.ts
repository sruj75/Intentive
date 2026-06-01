/**
 * routing domain — Routing shapes. Typed against the shared API contract so the
 * `GET /agent` response (agent_instance_id, ws_url, runtime_jwt) is validated by
 * monorepo typecheck. The `runtime_jwt` is the pass-through Neon Auth user token
 * (ADR-0038) — the Control Plane does not sign it. Behavior (resolving Routing,
 * issuing the token, the no-proxy guardrail) lands in #30.
 */
import type { GetAgentResponse } from "@intentive/api-contract";

export const routingSample: GetAgentResponse = {
  agent_instance_id: "agent_stub",
  ws_url: "wss://runtime.example.com/ws",
  runtime_jwt: "neon-auth-jwt-passthrough-stub",
};
