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
import { WebSocketServer } from "ws";

import { loadConfig } from "./config/env.js";
import { createConversationRepo } from "./domains/conversation/repo/conversation.js";
import { toConversationEntry } from "./domains/conversation/service/project-ingress.js";
import { createConnectHandler } from "./domains/gateway/service/connect.js";
import { createPostConnectRouter } from "./domains/gateway/ui/post-connect-router.js";
import {
  attachGatewayWebSocketHandler,
  type GatewayEventHandler,
} from "./domains/gateway/ui/ws-handler.js";
import { createInternalApp } from "./domains/internal/ui/app.js";
import { createEventLedger } from "./domains/sessions/repo/event-ledger.js";
import { createAgentInstanceRepo } from "./domains/sessions/repo/instance-registry.js";
import type { Sql } from "./domains/sessions/repo/sql.js";
import { createRuntimeIngressHandler } from "./domains/sessions/runtime/event-handler.js";
import { createUserQueue } from "./domains/sessions/runtime/user-queue.js";
import { createIngestEvent } from "./domains/sessions/service/ingest-event.js";
import { createStartSession } from "./domains/sessions/service/start-session.js";
import { isRuntimeIngressEvent } from "./domains/sessions/types/event.js";

const config = loadConfig();
const sql = neon(config.neon.url) as unknown as Sql;

const verifier = createJwtVerifier({
  jwks_url: config.neonAuth.jwksUrl,
  issuer: config.neonAuth.issuer,
  audience: config.neonAuth.audience,
});

const registry = createAgentInstanceRepo(sql);
const ledger = createEventLedger(sql);
const conversation = createConversationRepo(sql);
const queue = createUserQueue();
const ingest = createIngestEvent({
  ledger,
  // A recorded `user_message` is projected into Conversation History (its
  // user-authored half). The companion half is filled by its producer (#36),
  // which calls `conversation.append` directly. This mapping is the
  // `sessions` → `conversation` seam and must stay one line (ADR-0008).
  processor: async (session, event) => {
    const entry = toConversationEntry(session.userId, event);
    if (entry) {
      await conversation.append(entry);
    }
  },
});
const handleRuntimeIngress = createRuntimeIngressHandler({ ingest, queue });
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
  conversation,
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

// State-mutating ingress (`user_message`, `context_snapshot`,
// `session_end_marker`) flows through the ledger + ordering queue; History
// Backfill reads bypass it. The router branches between the two.
const ingressEventHandler: GatewayEventHandler = (session, event) =>
  isRuntimeIngressEvent(event) ? handleRuntimeIngress(session, event) : undefined;
const routePostConnectEvent = createPostConnectRouter({
  ingress: ingressEventHandler,
  conversation,
});

const wss = new WebSocketServer({ port: config.port });
wss.on("connection", (socket) => {
  attachGatewayWebSocketHandler(socket, connectHandler, routePostConnectEvent);
});

console.info(`Agent Runtime public WebSocket listening on :${config.port}`);
console.info(`Agent Runtime Internal API listening on :${config.internalInbound.port}`);
