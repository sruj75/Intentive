/**
 * Agent Runtime entrypoint.
 *
 * This composition root wires cross-domain and cross-cutting collaborators once
 * at boot. Domain modules receive typed dependencies and stay free of process
 * setup, sockets, and environment parsing.
 */
import { serve } from "@hono/node-server";
import { neon } from "@neondatabase/serverless";
import { createJwtVerifier } from "@intentive/providers/auth";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { CallbackHandler, Langfuse } from "langfuse-langchain";
import { WebSocketServer } from "ws";

import { loadConfig } from "./config/env.js";
import { createBundledFallbackSource } from "./domains/bundles/repo/bundled-fallback.js";
import { createLangfuseFloorSource } from "./domains/bundles/repo/langfuse-floor-source.js";
import { assembleSystemPrompt } from "./domains/bundles/service/assemble-system-prompt.js";
import { createProcedureFloorResolver } from "./domains/bundles/service/procedure-floor-resolver.js";
import { createConversationRepo } from "./domains/conversation/repo/conversation.js";
import { toConversationEntry } from "./domains/conversation/service/project-ingress.js";
import { createConnectHandler } from "./domains/gateway/service/connect.js";
import { createPostConnectRouter } from "./domains/gateway/ui/post-connect-router.js";
import { attachGatewayWebSocketHandler } from "./domains/gateway/ui/ws-handler.js";
import { createInternalApp } from "./domains/internal/ui/app.js";
import { createMemoryBackend, readUserProfile } from "./domains/memory/repo/memory-backend.js";
import { createDeepAgentsAdapter } from "./domains/runtime/repo/deep-agents-adapter.js";
import { createRuntimeTurnsRepo } from "./domains/runtime/repo/runtime-turns.js";
import { createTurnRunner } from "./domains/runtime/service/turn-runner.js";
import { createEventLedger } from "./domains/sessions/repo/event-ledger.js";
import { createAgentInstanceRepo } from "./domains/sessions/repo/instance-registry.js";
import { createSensoryBufferReader } from "./domains/sessions/repo/sensory-buffer.js";
import type { TransactionalSql } from "./domains/sessions/repo/sql.js";
import { createPerUserChannel } from "./domains/sessions/runtime/per-user-channel.js";
import { createStartSession } from "./domains/sessions/service/start-session.js";

const config = loadConfig();
const sql = neon(config.neon.url) as unknown as TransactionalSql;

const verifier = createJwtVerifier({
  jwks_url: config.neonAuth.jwksUrl,
  issuer: config.neonAuth.issuer,
  audience: config.neonAuth.audience,
});

const registry = createAgentInstanceRepo(sql);
const ledger = createEventLedger(sql);
const conversation = createConversationRepo(sql);
const sensoryBuffer = createSensoryBufferReader(sql);
const runtimeTurns = createRuntimeTurnsRepo(sql);
const memoryStore = PostgresStore.fromConnString(config.neon.url, { schema: "agent_runtime" });
await memoryStore.setup();
const memoryBackend = createMemoryBackend({ store: memoryStore });
const fallbackFloorSource = createBundledFallbackSource();
const langfuseConfig = config.langfuse;
const langfuseClient = langfuseConfig
  ? new Langfuse({
      publicKey: langfuseConfig.publicKey,
      secretKey: langfuseConfig.secretKey,
      baseUrl: langfuseConfig.baseUrl,
    })
  : null;
const floorResolver = createProcedureFloorResolver({
  source: langfuseClient ? createLangfuseFloorSource({ client: langfuseClient }) : null,
  fallback: fallbackFloorSource,
});
const runtimeAdapter = createDeepAgentsAdapter({
  connectionUri: config.neon.url,
  modelName: config.model.model,
  assemblePrompt: assembleSystemPrompt,
  store: memoryStore,
  backend: memoryBackend.backend,
  // A fresh handler per turn (not one shared instance) keeps each turn's trace
  // isolated; langfuse's handler holds the active trace on mutable state.
  createCallbackHandler: langfuseConfig
    ? () =>
        new CallbackHandler({
          publicKey: langfuseConfig.publicKey,
          secretKey: langfuseConfig.secretKey,
          baseUrl: langfuseConfig.baseUrl,
        })
    : null,
  openRouter: {
    apiKey: config.model.apiKey,
    baseUrl: config.model.baseUrl,
  },
});
await runtimeAdapter.setup();
const runTurn = createTurnRunner({
  sql,
  adapter: runtimeAdapter,
  conversation,
  runtimeTurns,
  fallbackModel: config.model.model,
  readUserProfile: (userId) => readUserProfile(memoryStore, userId),
  readRecentPerception: (userId) => sensoryBuffer.readLatest(userId),
});
const channel = createPerUserChannel({
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
  onPerceptionArrived: () => {},
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
  sessions: {
    async loadSessionByAuthSubject({ authSubject, clientKind }) {
      const agentInstance = await registry.loadByAuthSubject(authSubject);
      if (!agentInstance) {
        return null;
      }

      const userId = agentInstance.userId;
      return { userId, clientKind, agentInstanceId: agentInstance.id };
    },
  },
});

serve({ fetch: internalApp.fetch, port: config.internalInbound.port });

// The Per-User Channel is the single serialization point: state-mutating ingress
// (`user_message`, `context_snapshot`, `session_end_marker`) and History Backfill
// reads both pass through it, so reads observe earlier accepted writes in order.
const routePostConnectEvent = createPostConnectRouter({ channel });

const wss = new WebSocketServer({ port: config.port });
wss.on("connection", (socket) => {
  attachGatewayWebSocketHandler(socket, connectHandler, routePostConnectEvent);
});

console.info(`Agent Runtime public WebSocket listening on :${config.port}`);
console.info(`Agent Runtime Internal API listening on :${config.internalInbound.port}`);
