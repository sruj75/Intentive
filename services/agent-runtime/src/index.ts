/**
 * Agent Runtime composition root.
 *
 * Re-exports domain surfaces. Implementation lives under `src/domains/`; this
 * file only wires them together for the workspace's public entry point.
 */
export { companionMessageSample, runtimeConnectSample } from "./domains/protocol/types/events.js";
export { mapJwtVerificationErrorToRuntimeError } from "./domains/gateway/service/auth-failure.js";
export { runtimeContractSample } from "./domains/internal/types/sessions.js";
