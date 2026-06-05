/**
 * Internal domain — server-to-server API shapes (Session Start, etc.). This
 * sample is typed against the shared Control Plane contract so the Agent Runtime
 * consumes the internal Session Start response shape from day one.
 */
import type { PostInternalSessionsStartResponse } from "@intentive/api-contract";

export const runtimeContractSample: PostInternalSessionsStartResponse = {
  agent_instance_id: "agent_stub",
  ws_url: "https://runtime.example.com/ws",
};
