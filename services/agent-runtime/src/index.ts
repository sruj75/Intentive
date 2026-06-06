/**
 * Agent Runtime composition root.
 *
 * Re-exports service surfaces. Implementation lives under dedicated modules;
 * this file only wires them together for the workspace's public entry point.
 */
export { mapJwtVerificationErrorToRuntimeError } from "./domains/gateway/service/auth-failure.js";
export { createConnectHandler } from "./domains/gateway/service/connect.js";
export type { ConnectHandler, ConnectHandlerResult } from "./domains/gateway/service/connect.js";
export { attachGatewayWebSocketHandler } from "./domains/gateway/ui/ws-handler.js";
export { createInternalApp } from "./domains/internal/ui/app.js";
export { createInMemoryAgentInstanceRegistry } from "./domains/sessions/repo/instance-registry.js";
export type { AgentInstanceRegistry } from "./domains/sessions/repo/instance-registry.js";
export { createStartSession } from "./domains/sessions/service/start-session.js";
export type { StartSession } from "./domains/sessions/service/start-session.js";
export { AgentRuntimeConfigError, loadConfig } from "./config/env.js";
export type { AgentRuntimeConfig } from "./config/env.js";
