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
import { createConnectHandler } from "./domains/gateway/service/connect.js";
import { attachGatewayWebSocketHandler } from "./domains/gateway/ui/ws-handler.js";
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
const queue = createUserQueue();
const ingest = createIngestEvent({
  ledger,
  processor: async () => undefined,
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

const wss = new WebSocketServer({ port: config.port });
wss.on("connection", (socket) => {
  attachGatewayWebSocketHandler(socket, connectHandler, (session, event) => {
    if (!isRuntimeIngressEvent(event)) {
      return undefined;
    }

    return handleRuntimeIngress(session, event);
  });
});

console.info(`Agent Runtime public WebSocket listening on :${config.port}`);
console.info(`Agent Runtime Internal API listening on :${config.internalInbound.port}`);
