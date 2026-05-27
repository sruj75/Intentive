/**
 * Agent Runtime workspace scaffold.
 *
 * Imports both shared contracts so protocol + API contracts are consumed by
 * the runtime package from day one of monorepo-wide checks.
 */
import {
  clientToRuntimeEvent,
  runtimeToClientEvent,
  type ClientToRuntimeEvent,
  type RuntimeToClientEvent,
} from "@intentive/protocol";
import { PostInternalSessionsStartResponse } from "@intentive/api-contract";

export const runtimeContractSample: PostInternalSessionsStartResponse = {
  agent_instance_id: "agent_stub",
  ws_url: "https://runtime.example.com/ws",
};

export function parseClientEvent(input: unknown): ClientToRuntimeEvent {
  return clientToRuntimeEvent.parse(input);
}

export function parseRuntimeEvent(input: unknown): RuntimeToClientEvent {
  return runtimeToClientEvent.parse(input);
}
