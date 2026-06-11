/**
 * Agent Runtime composition root.
 *
 * Re-exports service surfaces. Implementation lives under dedicated modules;
 * this file only wires them together for the workspace's public entry point.
 */
export { mapJwtVerificationErrorToRuntimeError } from "./domains/gateway/service/auth-failure.js";
export { createConnectHandler } from "./domains/gateway/service/connect.js";
export { conversationHistoryUnavailableError } from "./domains/gateway/service/history-unavailable.js";
export type {
  ConnectHandler,
  ConnectHandlerResult,
  GatewaySessionRegistry,
} from "./domains/gateway/service/connect.js";
export { createPostConnectRouter } from "./domains/gateway/ui/post-connect-router.js";
export { attachGatewayWebSocketHandler } from "./domains/gateway/ui/ws-handler.js";
export type { GatewayEventHandler } from "./domains/gateway/ui/ws-handler.js";
export { createInternalApp } from "./domains/internal/ui/app.js";
export { createConversationRepo } from "./domains/conversation/repo/conversation.js";
export { toConversationEntry } from "./domains/conversation/service/project-ingress.js";
export type {
  ConversationEntry,
  ConversationRepo,
  SessionSnapshotReader,
} from "./domains/conversation/types/conversation.js";
export { createEventLedger } from "./domains/sessions/repo/event-ledger.js";
export type { EventLedger } from "./domains/sessions/repo/event-ledger.js";
export {
  createAgentInstanceRepo,
  createInMemoryAgentInstanceRegistry,
} from "./domains/sessions/repo/instance-registry.js";
export type { AgentInstanceRegistry } from "./domains/sessions/repo/instance-registry.js";
export type { Sql, SqlQuery, TransactionalSql } from "./domains/sessions/repo/sql.js";
export { createPerUserChannel } from "./domains/sessions/runtime/per-user-channel.js";
export { createUserQueue } from "./domains/sessions/runtime/user-queue.js";
export type { UserQueue } from "./domains/sessions/runtime/user-queue.js";
export { createStartSession } from "./domains/sessions/service/start-session.js";
export type { StartSession } from "./domains/sessions/service/start-session.js";
export { isRuntimeIngressEvent } from "./domains/sessions/types/event.js";
export type {
  BoundSession,
  EventProcessor,
  LedgerRecord,
  PerUserChannel,
  RuntimeEventKind,
  RuntimeIngressEvent,
} from "./domains/sessions/types/event.js";
export { AgentRuntimeConfigError, loadConfig } from "./config/env.js";
export type { AgentRuntimeConfig } from "./config/env.js";
