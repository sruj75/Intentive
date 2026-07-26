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
export { createConnectionRegistry } from "./domains/gateway/runtime/connection-registry.js";
export { attachGatewayWebSocketHandler } from "./domains/gateway/ui/ws-handler.js";
export type {
  GatewayConnectionRegistrar,
  GatewayEventHandler,
} from "./domains/gateway/ui/ws-handler.js";
export { createInternalApp } from "./domains/internal/ui/app.js";
export { createConversationRepo } from "./domains/conversation/repo/conversation.js";
export { toConversationEntry } from "./domains/conversation/service/project-ingress.js";
export type {
  ConversationEntry,
  ConversationRepo,
  ConversationSnapshotAudience,
  SessionSnapshotReader,
} from "./domains/conversation/types/conversation.js";
export { createCoachingWindowsRepo } from "./domains/coaching/repo/coaching-windows.js";
export { createRecentCoachingEvidenceReader } from "./domains/coaching/repo/recent-evidence.js";
export { createCoachingFeatureGate } from "./domains/coaching/service/feature-gate.js";
export type { CoachingFeatureGate } from "./domains/coaching/service/feature-gate.js";
export { createOpeningOrientation } from "./domains/coaching/service/opening-orientation.js";
export type { OpeningOrientation } from "./domains/coaching/service/opening-orientation.js";
export { createCoachingMetrics } from "./domains/coaching/service/coaching-metrics.js";
export type {
  CoachingMetrics,
  CoachingProactiveKind,
} from "./domains/coaching/service/coaching-metrics.js";
export { createMonitoringCoordinator } from "./domains/coaching/runtime/monitoring-coordinator.js";
export type { MonitoringCoordinator } from "./domains/coaching/runtime/monitoring-coordinator.js";
export type {
  AdvanceCoachingEvidenceInput,
  ClaimedOpening,
  CoachingMonitoringState,
  CoachingWindowsRepo,
  RecordCoachingJudgmentAttemptInput,
  RecentCoachingEvidence,
  RecentCoachingEvidenceInput,
  RecentCoachingEvidenceReader,
} from "./domains/coaching/types/coaching.js";
export {
  createLangfuseFloorSource,
  parseProcedureFloorBundle,
} from "./domains/bundles/repo/langfuse-floor-source.js";
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
export { PROCEDURE_FLOOR_PROMPT_NAME } from "./domains/bundles/types/floor.js";
export { createDeliveryPort } from "./domains/delivery/service/delivery-port.js";
export {
  coachingInterventionMessageId,
  createCoachingPostMessageBack,
} from "./domains/delivery/service/coaching-post-message-back.js";
export { createCoachingPostMessageBackTool } from "./domains/delivery/service/coaching-post-message-back-tool.js";
export { createPostMessageBack } from "./domains/delivery/service/post-message-back.js";
export { createPostMessageBackTool } from "./domains/delivery/service/post-message-back-tool.js";
export { createDeliveriesRepo } from "./domains/delivery/repo/deliveries.js";
export { createCpPushClient } from "./domains/delivery/repo/cp-push-client.js";
export { CHAT_CAPABLE_KINDS, isChatCapable } from "./domains/delivery/config/reachability.js";
export type {
  ConnectionHandle,
  ConnectionRegistry,
  CpPushClient,
  CoachingPostMessageBack,
  CoachingProactiveDeliveryMessage,
  DeliveriesRepo,
  DeliveryMessage,
  DeliveryPath,
  DeliveryPort,
  DeliveryRecord,
  DeliveryStatus,
  OrdinaryProactiveDeliveryMessage,
  PostMessageBack,
  ProactiveDeliveryMetricSink,
  RegisteredConnection,
  ReplyDeliveryMessage,
} from "./domains/delivery/types/delivery.js";
export {
  createAgentBackend,
  createMemoryBackend,
  readUserProfile,
  userMemoryNamespace,
} from "./domains/memory/repo/memory-backend.js";
export {
  createPerceptionRecordsRepo,
  embeddingText,
  toPerceptionRecord,
} from "./domains/perception/repo/perception-records.js";
export {
  permittedEmbeddingText,
  structuredScreenFields,
} from "./domains/perception/repo/screen-signals.js";
export {
  createOpenRouterPerceptionEmbedder,
  nullPerceptionEmbedder,
} from "./domains/perception/service/perception-embedder.js";
export { createSearchScreenContextTool } from "./domains/perception/service/search-screen-context.js";
export { createPerceptionIngressHooks } from "./domains/perception/service/perception-ingress-hooks.js";
export type { PerceptionIngressHooks } from "./domains/perception/service/perception-ingress-hooks.js";
export type {
  PerceptionEmbedder,
  PerceptionRecord,
  PerceptionRecordsRepo,
  ScreenContextSearchInput,
  ScreenContextSearchResult,
  StorePerceptionEmbeddingInput,
} from "./domains/perception/types/perception.js";
export { computeNextFireAt, parseSchedule, resolveTz } from "./domains/cron/config/schedule.js";
export { createCronBackend } from "./domains/cron/repo/cron-backend.js";
export { createCronJobsRepo } from "./domains/cron/repo/cron-jobs.js";
export type { CronJobsRepo } from "./domains/cron/repo/cron-jobs.js";
export { createCronRunsRepo } from "./domains/cron/repo/cron-runs.js";
export type { CronRunsRepo } from "./domains/cron/repo/cron-runs.js";
export { createCronScheduler } from "./domains/cron/runtime/cron-scheduler.js";
export type { CronScheduler } from "./domains/cron/runtime/cron-scheduler.js";
export { createCronTurnHandler, isTransient } from "./domains/cron/service/cron-turn.js";
export { parseCard, renderCard } from "./domains/cron/config/cron-card.js";
export type {
  CronCardFields,
  CronJob,
  CronJobStatus,
  CronRunRecord,
  CronRunStatus,
  ParsedSchedule,
  ScheduleKind,
} from "./domains/cron/types/cron.js";
export type { UserMemoryStore, UserMemoryStoreItem } from "./domains/memory/types/store.js";
export {
  buildRuntimeInvocationConfig,
  createDeepAgentsAdapter,
  extractModelUsage,
} from "./domains/runtime/repo/deep-agents-adapter.js";
export type { ModelUsageTelemetry } from "./domains/runtime/repo/deep-agents-adapter.js";
export { createRuntimeTurnsRepo } from "./domains/runtime/repo/runtime-turns.js";
export type { RuntimeTurnsRepo } from "./domains/runtime/repo/runtime-turns.js";
export { createMonitoringTurn } from "./domains/runtime/service/monitoring-turn.js";
export { createToolsForTurn } from "./domains/runtime/service/turn-tools.js";
export type {
  MonitoringTurnContext,
  MonitoringTurnTrigger,
} from "./domains/runtime/service/monitoring-turn.js";
export { createTurn } from "./domains/runtime/service/turn.js";
export { createTurnEffectGuard } from "./domains/runtime/service/turn-effect-guard.js";
export { createTurnRunner } from "./domains/runtime/service/turn-runner.js";
export { createBootstrapLifecycleRepo } from "./domains/sessions/repo/bootstrap-lifecycle.js";
export { createBootstrapLifecycle } from "./domains/sessions/service/bootstrap-lifecycle.js";
export type {
  BootstrapLifecycle,
  BootstrapLifecycleRepo,
  BootstrapStatus,
  BootstrapTurn,
} from "./domains/sessions/types/bootstrap.js";
export { createWorkingContext } from "./domains/runtime/service/working-context.js";
export { createShutdown } from "./runtime/shutdown.js";
export { createSchedulerClock } from "./runtime/scheduler-clock.js";
export type { SchedulerClock, SchedulerClockEntry } from "./runtime/scheduler-clock.js";
export type {
  WorkingContext,
  WorkingContextInput,
} from "./domains/runtime/service/working-context.js";
export type {
  DeepAgentsAdapter,
  RuntimeTurnInput,
  RuntimeTurnOutput,
  RuntimeTurnRecord,
  RuntimeTurnStatus,
  Turn,
  TurnEffectGuard,
  TurnExecution,
  TurnRunner,
  TurnSqlQuery,
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
  CoachingWindowLifecycleEvent,
  CoachingWindowLifecycleSink,
  EventProcessor,
  LedgerRecord,
  PerUserChannel,
  PerceptionArrivedSink,
  PerceptionProjectedSink,
  RuntimeEventKind,
  RuntimeIngressEvent,
  UserMessageCommittedSink,
} from "./domains/sessions/types/event.js";
export { createHeartbeatScheduleRepo } from "./domains/heartbeat/repo/heartbeat-schedule.js";
export type {
  HeartbeatDueUser,
  HeartbeatScheduleRepo,
  HeartbeatUserCandidate,
} from "./domains/heartbeat/repo/heartbeat-schedule.js";
export { createHeartbeatScheduler } from "./domains/heartbeat/runtime/heartbeat-scheduler.js";
export type { HeartbeatScheduler } from "./domains/heartbeat/runtime/heartbeat-scheduler.js";
export { AgentRuntimeConfigError, loadConfig } from "./config/env.js";
export type { AgentRuntimeConfig } from "./config/env.js";
