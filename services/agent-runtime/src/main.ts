/**
 * Agent Runtime entrypoint.
 *
 * This composition root wires cross-domain and cross-cutting collaborators once
 * at boot. Domain modules receive typed dependencies and stay free of process
 * setup, sockets, and environment parsing.
 */
import { serve } from "@hono/node-server";
import { neon } from "@neondatabase/serverless";
import { createJwtVerifier, createLocalDevJwtVerifier } from "@intentive/providers/auth";
import { createFlagClient } from "@intentive/providers/flags";
import { bootstrapObservability } from "@intentive/providers/observability";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { Langfuse } from "langfuse-langchain";
import { WebSocketServer } from "ws";

import { loadConfig } from "./config/env.js";
import { createLangfuseFloorSource } from "./domains/bundles/repo/langfuse-floor-source.js";
import { assembleSystemPrompt } from "./domains/bundles/service/assemble-system-prompt.js";
import { createProcedureFloorResolver } from "./domains/bundles/service/procedure-floor-resolver.js";
import { createCoachingFeatureGate } from "./domains/coaching/service/feature-gate.js";
import { createRecentCoachingEvidenceReader } from "./domains/coaching/repo/recent-evidence.js";
import { createCoachingWindowsRepo } from "./domains/coaching/repo/coaching-windows.js";
import { createMonitoringCoordinator } from "./domains/coaching/runtime/monitoring-coordinator.js";
import type { MonitoringCoordinator } from "./domains/coaching/runtime/monitoring-coordinator.js";
import { createCoachingMetrics } from "./domains/coaching/service/coaching-metrics.js";
import { createOpeningOrientation } from "./domains/coaching/service/opening-orientation.js";
import { createConversationRepo } from "./domains/conversation/repo/conversation.js";
import { toConversationEntry } from "./domains/conversation/service/project-ingress.js";
import { createCronBackend } from "./domains/cron/repo/cron-backend.js";
import { createCronJobsRepo } from "./domains/cron/repo/cron-jobs.js";
import { createCronRunsRepo } from "./domains/cron/repo/cron-runs.js";
import { createCronScheduler } from "./domains/cron/runtime/cron-scheduler.js";
import { createCronTurnHandler } from "./domains/cron/service/cron-turn.js";
import { createCpPushClient } from "./domains/delivery/repo/cp-push-client.js";
import { createDeliveriesRepo } from "./domains/delivery/repo/deliveries.js";
import { createDeliveryPort } from "./domains/delivery/service/delivery-port.js";
import { createCoachingPostMessageBack } from "./domains/delivery/service/coaching-post-message-back.js";
import { createCoachingPostMessageBackTool } from "./domains/delivery/service/coaching-post-message-back-tool.js";
import { createPostMessageBack } from "./domains/delivery/service/post-message-back.js";
import { createPostMessageBackTool } from "./domains/delivery/service/post-message-back-tool.js";
import { createConnectionRegistry } from "./domains/gateway/runtime/connection-registry.js";
import { createConnectHandler } from "./domains/gateway/service/connect.js";
import { createPostConnectRouter } from "./domains/gateway/ui/post-connect-router.js";
import { attachGatewayWebSocketHandler } from "./domains/gateway/ui/ws-handler.js";
import { createHeartbeatScheduleRepo } from "./domains/heartbeat/repo/heartbeat-schedule.js";
import { createHeartbeatScheduler } from "./domains/heartbeat/runtime/heartbeat-scheduler.js";
import { createInternalApp } from "./domains/internal/ui/app.js";
import { createAgentBackend, readUserProfile } from "./domains/memory/repo/memory-backend.js";
import {
  createPerceptionRecordsRepo,
  toPerceptionRecord,
} from "./domains/perception/repo/perception-records.js";
import { createOpenRouterPerceptionEmbedder } from "./domains/perception/service/perception-embedder.js";
import { createPerceptionIngressHooks } from "./domains/perception/service/perception-ingress-hooks.js";
import { createSearchScreenContextTool } from "./domains/perception/service/search-screen-context.js";
import { createDeepAgentsAdapter } from "./domains/runtime/repo/deep-agents-adapter.js";
import { createRuntimeTurnsRepo } from "./domains/runtime/repo/runtime-turns.js";
import { createMonitoringTurn } from "./domains/runtime/service/monitoring-turn.js";
import { createTurn } from "./domains/runtime/service/turn.js";
import { createTurnRunner } from "./domains/runtime/service/turn-runner.js";
import { createToolsForTurn } from "./domains/runtime/service/turn-tools.js";
import { createWorkingContext } from "./domains/runtime/service/working-context.js";
import { createEventLedger } from "./domains/sessions/repo/event-ledger.js";
import { createAgentInstanceRepo } from "./domains/sessions/repo/instance-registry.js";
import { createBootstrapLifecycleRepo } from "./domains/sessions/repo/bootstrap-lifecycle.js";
import { createBootstrapLifecycle } from "./domains/sessions/service/bootstrap-lifecycle.js";
import type { TransactionalSql } from "./domains/sessions/repo/sql.js";
import { createPerUserChannel } from "./domains/sessions/runtime/per-user-channel.js";
import { createStartSession } from "./domains/sessions/service/start-session.js";
import type { PerUserChannel } from "./domains/sessions/types/event.js";
import { retryTransientDb as retryTransientDbOperation } from "./runtime/db-retry.js";
import { createShutdown } from "./runtime/shutdown.js";

const config = loadConfig();
const coachingGate = createCoachingFeatureGate({
  flags: createFlagClient({
    defaults: { desktop_coaching_v1: config.coaching.enabled },
  }),
  founderUserIds: config.coaching.founderUserIds,
});
const langfuseClient = new Langfuse({
  publicKey: config.langfuse.publicKey,
  secretKey: config.langfuse.secretKey,
  baseUrl: config.langfuse.baseUrl,
});
const observability = bootstrapObservability(
  {
    sentry: config.sentry,
    langfuse: config.langfuse,
  },
  { shutdown: [() => drainLangfuseClient(langfuseClient)] },
);
const log = observability.createLogger("agent-runtime");
const retryTransientDb = <T>(operation: () => Promise<T>) =>
  retryTransientDbOperation(operation, { logger: log });
const sql = neon(config.neon.url) as unknown as TransactionalSql;
// The turn write path and Per-User Channel ingress each commit through one Neon
// array transaction. On a network without IPv6 egress (Neon is dual-stack), a
// transient connect blip would otherwise abort the turn *after* the model replied
// — so no companion reply lands. Retry the whole atomic transaction on transient
// errors: every batched insert is `ON CONFLICT DO NOTHING` (ledger, conversation)
// except the single `runtime_turns` anchor, and a rolled-back transaction re-runs
// cleanly. ADR-0020 containment is unchanged — a turn still failing after retries
// fails per-trigger.
const resilientSql = withTransactionRetry(sql);

// ADR-0035: event-driven schedulers. The two clocks are constructed early so the
// write-path hooks below can push committed due-times onto them; their `enqueue`
// callbacks close over `channel` / `fireCron` / `monitoringTurn`, which are only
// invoked at fire-time (after `start()`), so the forward references are safe.
const heartbeatFloorMs = 120_000;
const heartbeatScheduleRepo = createHeartbeatScheduleRepo(sql);
const cronJobs = createCronJobsRepo(sql);

let channel: PerUserChannel;
let monitoringCoordinator: MonitoringCoordinator;

const heartbeatScheduler = createHeartbeatScheduler({
  scheduleRepo: heartbeatScheduleRepo,
  enqueueHeartbeat: (userId) => monitoringCoordinator?.onHeartbeat(userId) ?? false,
  floorMs: heartbeatFloorMs,
  logger: log,
});
const cronScheduler = createCronScheduler({
  cronJobsRepo: cronJobs,
  enqueueCron: (job, context) => channel.enqueueCommitted(job.userId, () => fireCron(job, context)),
  logger: log,
});

const verifier =
  config.auth.mode === "local-dev"
    ? createLocalDevJwtVerifier({
        secret: config.auth.localDevSecret ?? "",
        issuer: config.neonAuth.issuer,
        audience: config.neonAuth.audience,
      })
    : createJwtVerifier({
        jwks_url: config.neonAuth.jwksUrl,
        issuer: config.neonAuth.issuer,
        audience: config.neonAuth.audience,
      });

const registry = createAgentInstanceRepo(sql);
const bootstrapLifecycle = createBootstrapLifecycle(createBootstrapLifecycleRepo(sql));
const resilientRegistry = {
  loadOrCreate: (input: Parameters<typeof registry.loadOrCreate>[0]) =>
    retryTransientDb(() => registry.loadOrCreate(input)),
  loadByAuthSubject: (authSubject: string) =>
    retryTransientDb(() => registry.loadByAuthSubject(authSubject)),
  loadByUserId: (userId: string) => retryTransientDb(() => registry.loadByUserId(userId)),
  recordClientTzByAuthSubject: (authSubject: string, clientTz?: string) =>
    retryTransientDb(() => registry.recordClientTzByAuthSubject(authSubject, clientTz)),
  loadUserTz: (userId: string) => retryTransientDb(() => registry.loadUserTz(userId)),
};
const ledger = createEventLedger(sql);
const conversation = createConversationRepo(sql);
const coachingWindows = createCoachingWindowsRepo(sql);
const recentCoachingEvidence = createRecentCoachingEvidenceReader(sql);
const perceptionEmbedder = createOpenRouterPerceptionEmbedder({
  apiKey: config.model.apiKey,
  baseUrl: config.model.baseUrl,
});
const perceptionRecords = createPerceptionRecordsRepo(sql, perceptionEmbedder);
const runtimeTurns = createRuntimeTurnsRepo(sql);
const cronRuns = createCronRunsRepo(sql);
const connectionRegistry = createConnectionRegistry({ logger: log });
const coachingMetrics = createCoachingMetrics({
  logger: log,
  isEnabled: (userId) => coachingGate.isEnabled(userId),
});
const deliveries = createDeliveriesRepo(sql);
const cpPush = createCpPushClient({
  baseUrl: config.controlPlane.baseUrl,
  internalSecret: config.controlPlane.internalSecret,
});
const deliveryPort = createDeliveryPort({
  registry: connectionRegistry,
  deliveries,
  cpPush,
  authorizeProactive: async (userId, windowId) =>
    coachingGate.isEnabled(userId) &&
    (await retryTransientDb(() => coachingWindows.isActive(userId, windowId))),
  coachingMetrics,
  logger: log,
});
const postMessageBack = createPostMessageBack({
  conversation,
  deliveryPort,
  logger: log,
});
const coachingPostMessageBack = createCoachingPostMessageBack({
  connections: connectionRegistry,
  conversation,
  deliveryPort,
  authorize: async (userId, context) => {
    if (
      !coachingGate.isEnabled(userId) ||
      !(await retryTransientDb(() => coachingWindows.isActive(userId, context.windowId)))
    ) {
      return false;
    }
    return retryTransientDb(() =>
      recentCoachingEvidence.isCurrent({
        userId,
        windowId: context.windowId,
        cursorStart: context.evidenceCursorStart,
        cursorEnd: context.evidenceCursorEnd,
        version: context.evidenceVersion,
      }),
    );
  },
  logger: log,
});
const memoryStore = PostgresStore.fromConnString(config.neon.url, { schema: "agent_runtime" });
await retryTransientDb(() => memoryStore.setup());
const cronBackend = createCronBackend({
  repo: cronJobs,
  loadUserTz: (userId) => resilientRegistry.loadUserTz(userId),
  onScheduleCron: (job) => {
    if (job.nextFireAt) {
      cronScheduler.schedule(job.id, job.nextFireAt, job);
    }
  },
  onCancelCron: (id) => cronScheduler.cancel(id),
});
const agentBackend = createAgentBackend({ store: memoryStore, cronBackend });
const floorResolver = createProcedureFloorResolver({
  source: createLangfuseFloorSource({ client: langfuseClient }),
});
// The Procedure Floor is a hard Runtime dependency. Resolve and validate it
// before opening listeners so a missing or malformed production prompt fails
// deployment visibly instead of serving undefined behavior.
await floorResolver.resolve("production");
const runtimeAdapter = createDeepAgentsAdapter({
  connectionUri: config.neon.url,
  modelName: config.model.model,
  assemblePrompt: assembleSystemPrompt,
  store: memoryStore,
  backend: agentBackend.backend,
  // A fresh handler per turn (not one shared instance) keeps each turn's trace
  // isolated; langfuse's handler holds the active trace on mutable state.
  createCallbackHandler: observability.createCallbackHandler,
  createTools: (input) =>
    createToolsForTurn(input, {
      // Opening returns its one stable visible response directly. Monitoring
      // receives only internally bound egress: the fixed window evidence cannot
      // be bypassed with user-wide historical search.
      ordinaryEgress: () =>
        createPostMessageBackTool({
          postMessageBack,
          userId: input.userId,
        }),
      coachingEgress: () => {
        if (
          input.windowId === undefined ||
          input.evidenceVersion === undefined ||
          input.evidenceCursorStart === undefined ||
          input.evidenceCursorEnd === undefined ||
          input.effects === undefined
        ) {
          throw new Error("Monitoring egress requires internally bound turn identity");
        }
        return createCoachingPostMessageBackTool({
          postMessageBack: coachingPostMessageBack,
          userId: input.userId,
          windowId: input.windowId,
          evidenceVersion: input.evidenceVersion,
          evidenceCursorStart: input.evidenceCursorStart,
          evidenceCursorEnd: input.evidenceCursorEnd,
          effects: input.effects,
        });
      },
      // Historical perception search remains an ordinary interactive tool.
      screenContext: () =>
        createSearchScreenContextTool({
          search: (searchInput) => retryTransientDb(() => perceptionRecords.search(searchInput)),
          userId: input.userId,
        }),
    }),
  openRouter: {
    apiKey: config.model.apiKey,
    baseUrl: config.model.baseUrl,
  },
  logger: log,
});
await retryTransientDb(() => runtimeAdapter.setup());
const workingContext = createWorkingContext({
  readUserProfile: (userId) => retryTransientDb(() => readUserProfile(memoryStore, userId, log)),
});
const turn = createTurn({
  sql: resilientSql,
  adapter: runtimeAdapter,
  workingContext,
  runtimeTurns,
  fallbackModel: config.model.model,
  logger: log,
});
const runTurn = createTurnRunner({
  sql,
  adapter: runtimeAdapter,
  conversation,
  bootstrap: bootstrapLifecycle,
  isBootstrapReplyEligible: async (session, event) => {
    const windowId = event.window_id;
    return (
      session.clientKind === "desktop" &&
      session.capabilities.includes("desktop_coaching_v1") &&
      windowId !== undefined &&
      coachingGate.isEnabled(session.userId) &&
      connectionRegistry.hasActiveCoachingWindow(session.userId, windowId) &&
      (await retryTransientDb(() => coachingWindows.isActive(session.userId, windowId)))
    );
  },
  deliveryPort,
  turn,
  logger: log,
});
const fireCron = createCronTurnHandler({
  cronJobs,
  cronRuns,
  floorResolver,
  loadUserTz: (userId) => resilientRegistry.loadUserTz(userId),
  onRescheduleCron: (job, nextFireAt) => cronScheduler.schedule(job.id, nextFireAt, job),
  onCancelCron: (id) => cronScheduler.cancel(id),
  turn,
  logger: log,
});
const monitoringTurn = createMonitoringTurn({
  turn,
});
const openingOrientation = createOpeningOrientation({
  bootstrap: bootstrapLifecycle,
  windows: coachingWindows,
  conversation,
  deliveryPort,
  turn,
  isEligible: (userId) => coachingGate.isEnabled(userId),
  isActivelyAttested: (userId, windowId) =>
    connectionRegistry.hasActiveCoachingWindow(userId, windowId),
  logger: log,
});
const perceptionIngressHooks = createPerceptionIngressHooks({
  embedder: perceptionEmbedder,
  loadEmbeddingCandidate: (expectedRecord) =>
    retryTransientDb(() => perceptionRecords.readEmbeddingCandidate(expectedRecord)),
  storeEmbedding: (input) => retryTransientDb(() => perceptionRecords.storeEmbedding(input)),
  // Monitoring is coordinated with the committed projection below so it keeps
  // the exact window/event identity. Embedding remains an independent hook.
  enqueueMonitoring: () => false,
  onEmbeddingError: (error, context) => {
    log.error("perception.embedding_failed", error, {
      user_id: context.userId,
      event_id: context.eventId,
      status: "failed",
    });
  },
});
channel = createPerUserChannel({
  sql: resilientSql,
  ledger,
  conversation,
  // `user_message` projects into Conversation History; `perception_event`
  // projects into the searchable perception store. Both happen in the same
  // transaction as the event-ledger row.
  project: (session, event) => {
    const queries: Promise<unknown[]>[] = [];
    const entry = toConversationEntry(session.userId, event);
    if (entry) {
      queries.push(conversation.appendQuery(entry));
    }
    if (event.type === "perception_event") {
      queries.push(perceptionRecords.appendQuery(toPerceptionRecord(session.userId, event)));
    }
    if (event.type === "perception_tombstone") {
      queries.push(perceptionRecords.tombstoneQuery(session.userId, event));
    }
    if (event.type === "coaching_window_started" || event.type === "coaching_window_ended") {
      queries.push(...coachingWindows.projectLifecycle(session.userId, event));
    }
    return queries;
  },
  runTurn,
  onPerceptionProjected: perceptionIngressHooks.onPerceptionProjected,
  onPerceptionArrived: (session, event) => {
    if (event.type === "perception_event") {
      monitoringCoordinator.onPerception(session, event);
    }
  },
  onCoachingWindowLifecycle: (session, event) => {
    coachingMetrics.onLifecycle(session.userId, event);
    monitoringCoordinator.onLifecycle(session, event);
  },
  onUserMessageCommitted: (session) => {
    coachingMetrics.onUserMessage(session);
  },
  logger: log,
});
monitoringCoordinator = createMonitoringCoordinator({
  gate: coachingGate,
  windows: coachingWindows,
  evidence: recentCoachingEvidence,
  connections: connectionRegistry,
  channel,
  opening: openingOrientation,
  monitoringTurn,
  scheduler: heartbeatScheduler,
  floorMs: heartbeatFloorMs,
  logger: log,
});
const startSession = createStartSession({
  registry: resilientRegistry,
  wsUrl: config.publicWsUrl,
});
const internalApp = createInternalApp({
  secret: config.internalInbound.secret,
  startSession,
});
const connectHandler = createConnectHandler({
  verifier,
  conversation: channel,
  floorResolver,
  logger: log,
  sessions: {
    async loadSessionByAuthSubject({ authSubject, clientKind, clientTz }) {
      await resilientRegistry.recordClientTzByAuthSubject(authSubject, clientTz);
      const agentInstance = await resilientRegistry.loadByAuthSubject(authSubject);
      if (!agentInstance) {
        return null;
      }

      const userId = agentInstance.userId;
      return { userId, clientKind, agentInstanceId: agentInstance.id };
    },
  },
});

const internalServer = serve({ fetch: internalApp.fetch, port: config.internalInbound.port });

// The Per-User Channel is the single serialization point: state-mutating ingress
// (`user_message`, `perception_event`, `session_end_marker`) and History Backfill
// reads both pass through it, so reads observe earlier accepted writes in order.
const routePostConnectEvent = createPostConnectRouter({
  channel,
  coachingConnections: connectionRegistry,
  onCoachingPresence: (session, event) => monitoringCoordinator.onPresence(session, event),
  onCoachingDeliveryAck: (session, messageId) =>
    monitoringCoordinator.onDeliveryAck(session, messageId),
});

const wss = new WebSocketServer({ port: config.port });
wss.on("connection", (socket) => {
  attachGatewayWebSocketHandler(
    socket,
    connectHandler,
    routePostConnectEvent,
    (session, connectedSocket) => connectionRegistry.register(session, connectedSocket),
    log,
  );
});

log.info("runtime.public_ws_listening", { status: "ok" });
log.info("runtime.internal_api_listening", { status: "ok" });
cronScheduler.start();
heartbeatScheduler.start();

const shutdown = createShutdown({
  schedulers: [cronScheduler, heartbeatScheduler],
  wss,
  internalServer,
  observability,
  logger: log,
});
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

async function drainLangfuseClient(client: LangfuseDrainClient): Promise<void> {
  if (client.shutdownAsync) {
    await client.shutdownAsync();
    return;
  }
  await client.flushAsync?.();
}

/**
 * Wrap a `TransactionalSql` so its array `transaction()` retries transient Neon
 * connection errors. The tagged-template call is passed through unchanged (it
 * only *builds* the lazy queries the repos batch into a transaction; reads on the
 * turn path are retried separately via `retryTransientDb`).
 */
function withTransactionRetry(base: TransactionalSql): TransactionalSql {
  const wrapped = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    base(strings, ...values)) as TransactionalSql;
  wrapped.transaction = (queries) => retryTransientDb(() => base.transaction(queries));
  return wrapped;
}

interface LangfuseDrainClient {
  shutdownAsync?: () => Promise<unknown>;
  flushAsync?: () => Promise<unknown>;
}
