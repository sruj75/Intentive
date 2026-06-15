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
export { createBundledFallbackSource } from "./domains/bundles/repo/bundled-fallback.js";
export { createLangfuseFloorSource } from "./domains/bundles/repo/langfuse-floor-source.js";
export type { LangfusePromptClient } from "./domains/bundles/repo/langfuse-floor-source.js";
export { assembleSystemPrompt } from "./domains/bundles/service/assemble-system-prompt.js";
export { createProcedureFloorResolver } from "./domains/bundles/service/procedure-floor-resolver.js";
export type {
  FloorSource,
  PinnedProcedureFloor,
  ProcedureFloorDocument,
  ProcedureFloorDocuments,
  ProcedureFloorResolver,
  TurnTrigger,
} from "./domains/bundles/types/floor.js";
export {
  createAgentBackend,
  createMemoryBackend,
  readUserProfile,
  userMemoryNamespace,
} from "./domains/memory/repo/memory-backend.js";
export { computeNextFireAt, parseSchedule, resolveTz } from "./domains/cron/config/schedule.js";
export { createCronBackend } from "./domains/cron/repo/cron-backend.js";
export { createCronJobsRepo } from "./domains/cron/repo/cron-jobs.js";
export type { CronJobsRepo } from "./domains/cron/repo/cron-jobs.js";
export { createCronRunsRepo } from "./domains/cron/repo/cron-runs.js";
export type { CronRunsRepo } from "./domains/cron/repo/cron-runs.js";
export { createCronScheduler } from "./domains/cron/runtime/cron-scheduler.js";
export { createCronTurnHandler, isTransient } from "./domains/cron/service/cron-turn.js";
export { parseCard, renderCard } from "./domains/cron/config/cron-card.js";
export type {
  CronCardFields,
  CronFireEvent,
  CronJob,
  CronJobStatus,
  CronRunRecord,
  CronRunStatus,
  ParsedSchedule,
  ScheduleKind,
} from "./domains/cron/types/cron.js";
export type { UserMemoryStore, UserMemoryStoreItem } from "./domains/memory/types/store.js";
export { createDeepAgentsAdapter } from "./domains/runtime/repo/deep-agents-adapter.js";
export { createRuntimeTurnsRepo } from "./domains/runtime/repo/runtime-turns.js";
export type { RuntimeTurnsRepo } from "./domains/runtime/repo/runtime-turns.js";
export { createTurnRunner } from "./domains/runtime/service/turn-runner.js";
export type {
  DeepAgentsAdapter,
  RuntimeTurnInput,
  RuntimeTurnOutput,
  RuntimeTurnRecord,
  RuntimeTurnStatus,
  TurnRunner,
} from "./domains/runtime/types/turn.js";
export { createEventLedger } from "./domains/sessions/repo/event-ledger.js";
export type { EventLedger } from "./domains/sessions/repo/event-ledger.js";
export { createSensoryBufferReader } from "./domains/sessions/repo/sensory-buffer.js";
export type { SensoryBufferReader } from "./domains/sessions/repo/sensory-buffer.js";
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
  PerceptionArrivedSink,
  RuntimeEventKind,
  RuntimeIngressEvent,
} from "./domains/sessions/types/event.js";
export { AgentRuntimeConfigError, loadConfig } from "./config/env.js";
export type { AgentRuntimeConfig } from "./config/env.js";
