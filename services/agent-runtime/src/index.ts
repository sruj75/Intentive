/**
 * Agent Runtime workspace scaffold.
 *
 * Imports shared contract types so protocol + API contracts are consumed by
 * the runtime package from day one of monorepo-wide typechecks.
 */
import type { ClientToRuntimeEvent, RuntimeToClientEvent } from "@intentive/protocol";
import type { PostInternalSessionsStartResponse } from "@intentive/api-contract";

export const runtimeContractSample: PostInternalSessionsStartResponse = {
  agent_instance_id: "agent_stub",
  ws_url: "https://runtime.example.com/ws",
};

export const runtimeConnectSample: ClientToRuntimeEvent = {
  type: "connect",
  auth_token: "token",
  client_kind: "mobile",
  client_version: "0.0.0",
};

export const companionMessageSample: RuntimeToClientEvent = {
  type: "companion_message",
  message_id: "message_stub",
  body: "hello",
  emitted_at: "2026-05-28T00:00:00.000Z",
  via_post_message_back: false,
};
