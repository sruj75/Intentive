/**
 * Agent Runtime composition root.
 *
 * Re-exports service surfaces. Implementation lives under dedicated modules;
 * this file only wires them together for the workspace's public entry point.
 */
export { mapJwtVerificationErrorToRuntimeError } from "./domains/gateway/service/auth-failure.js";
export { AgentRuntimeConfigError, loadConfig } from "./config/env.js";
export type { AgentRuntimeConfig } from "./config/env.js";
