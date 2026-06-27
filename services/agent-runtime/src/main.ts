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
import { bootstrapObservability } from "@intentive/providers/observability";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { Langfuse } from "langfuse-langchain";
import { WebSocketServer } from "ws";

import { loadConfig } from "./config/env.js";
import { createBundledFallbackSource } from "./domains/bundles/repo/bundled-fallback.js";
import { createLangfuseFloorSource } from "./domains/bundles/repo/langfuse-floor-source.js";
import { assembleSystemPrompt } from "./domains/bundles/service/assemble-system-prompt.js";
import { createProcedureFloorResolver } from "./domains/bundles/service/procedure-floor-resolver.js";
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
import { createDeepAgentsAdapter } from "./domains/runtime/repo/deep-agents-adapter.js";
import { createRuntimeTurnsRepo } from "./domains/runtime/repo/runtime-turns.js";
import { createMonitoringTurn } from "./domains/runtime/service/monitoring-turn.js";
import { createTurn } from "./domains/runtime/service/turn.js";
import { createTurnRunner } from "./domains/runtime/service/turn-runner.js";
import { createWorkingContext } from "./domains/runtime/service/working-context.js";
import { createEventLedger } from "./domains/sessions/repo/event-ledger.js";
import { createAgentInstanceRepo } from "./domains/sessions/repo/instance-registry.js";
import { createSensoryBufferReader } from "./domains/sessions/repo/sensory-buffer.js";
import type { TransactionalSql } from "./domains/sessions/repo/sql.js";
import { createPerUserChannel } from "./domains/sessions/runtime/per-user-channel.js";
import { createStartSession } from "./domains/sessions/service/start-session.js";
import type { PerUserChannel } from "./domains/sessions/types/event.js";
import { createShutdown } from "./runtime/shutdown.js";

const config = loadConfig();
const langfuseConfig = config.langfuse;
const langfuseClient = langfuseConfig
  ? new Langfuse({
      publicKey: langfuseConfig.publicKey,
      secretKey: langfuseConfig.secretKey,
      baseUrl: langfuseConfig.baseUrl,
    })
  : null;
const observability = bootstrapObservability(
  {
    sentry: config.sentry,
    langfuse: config.langfuse,
  },
  langfuseClient ? { shutdown: [() => drainLangfuseClient(langfuseClient)] } : {},
);
const log = observability.createLogger("agent-runtime");
const sql = neon(config.neon.url) as unknown as TransactionalSql;

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
const ledger = createEventLedger(sql);
const conversation = createConversationRepo(sql);
const sensoryBuffer = createSensoryBufferReader(sql);
const runtimeTurns = createRuntimeTurnsRepo(sql);
const cronJobs = createCronJobsRepo(sql);
const cronRuns = createCronRunsRepo(sql);
const connectionRegistry = createConnectionRegistry({ logger: log });
const deliveries = createDeliveriesRepo(sql);
const cpPush = createCpPushClient({
  baseUrl: config.controlPlane.baseUrl,
  internalSecret: config.controlPlane.internalSecret,
});
const deliveryPort = createDeliveryPort({
  registry: connectionRegistry,
  deliveries,
  cpPush,
  logger: log,
});
const postMessageBack = createPostMessageBack({
  conversation,
  deliveryPort,
  logger: log,
});
const memoryStore = PostgresStore.fromConnString(config.neon.url, { schema: "agent_runtime" });
await memoryStore.setup();
const cronBackend = createCronBackend({
  repo: cronJobs,
  loadUserTz: (userId) => registry.loadUserTz(userId),
});
const agentBackend = createAgentBackend({ store: memoryStore, cronBackend });
const fallbackFloorSource = createBundledFallbackSource();
const floorResolver = createProcedureFloorResolver({
  source: langfuseClient ? createLangfuseFloorSource({ client: langfuseClient }) : null,
  fallback: fallbackFloorSource,
});
const runtimeAdapter = createDeepAgentsAdapter({
  connectionUri: config.neon.url,
  modelName: config.model.model,
  assemblePrompt: assembleSystemPrompt,
  store: memoryStore,
  backend: agentBackend.backend,
  // A fresh handler per turn (not one shared instance) keeps each turn's trace
  // isolated; langfuse's handler holds the active trace on mutable state.
  createCallbackHandler: langfuseConfig ? observability.createCallbackHandler : null,
  createTools: (input) => [createPostMessageBackTool({ postMessageBack, userId: input.userId })],
  openRouter: {
    apiKey: config.model.apiKey,
    baseUrl: config.model.baseUrl,
  },
  logger: log,
});
await runtimeAdapter.setup();
const workingContext = createWorkingContext({
  readUserProfile: (userId) => readUserProfile(memoryStore, userId, log),
  readRecentPerception: (userId) => sensoryBuffer.readLatest(userId),
});
const turn = createTurn({
  sql,
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
  deliveryPort,
  turn,
  logger: log,
});
const fireCron = createCronTurnHandler({
  cronJobs,
  cronRuns,
  floorResolver,
  loadUserTz: (userId) => registry.loadUserTz(userId),
  turn,
  logger: log,
});
const monitoringTurn = createMonitoringTurn({
  floorResolver,
  turn,
});
let channel: PerUserChannel;
channel = createPerUserChannel({
  sql,
  ledger,
  conversation,
  // A `user_message` is transactionally projected into Conversation History
  // (its user-authored half) with the Agent Runtime event ledger row. The companion
  // half is filled by its producer (#36), which calls `conversation.append`
  // directly. This mapping is the `sessions` → `conversation` seam and must
  // stay one line (ADR-0008 / ADR-0009).
  project: (session, event) => {
    const entry = toConversationEntry(session.userId, event);
    return entry ? [conversation.appendQuery(entry)] : [];
  },
  runTurn,
  onPerceptionArrived: (session) => {
    channel.enqueueBestEffort(session.userId, () =>
      monitoringTurn(session.userId, "context_snapshot"),
    );
  },
  logger: log,
});
const cronScheduler = createCronScheduler({
  cronJobsRepo: cronJobs,
  enqueueCron: (job, context) => channel.enqueueCommitted(job.userId, () => fireCron(job, context)),
  logger: log,
});
const heartbeatScheduler = createHeartbeatScheduler({
  scheduleRepo: createHeartbeatScheduleRepo(sql),
  enqueueHeartbeat: (userId) =>
    channel.enqueueBestEffort(userId, () => monitoringTurn(userId, "heartbeat")),
  logger: log,
});
const startSession = createStartSession({
  registry,
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
      await registry.recordClientTzByAuthSubject(authSubject, clientTz);
      const agentInstance = await registry.loadByAuthSubject(authSubject);
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
// (`user_message`, `context_snapshot`, `session_end_marker`) and History Backfill
// reads both pass through it, so reads observe earlier accepted writes in order.
const routePostConnectEvent = createPostConnectRouter({ channel });

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

interface LangfuseDrainClient {
  shutdownAsync?: () => Promise<unknown>;
  flushAsync?: () => Promise<unknown>;
}
