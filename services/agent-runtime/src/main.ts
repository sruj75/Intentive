/**
 * Agent Runtime entrypoint.
 *
 * This composition root wires cross-domain and cross-cutting collaborators once
 * at boot. Domain modules receive typed dependencies and stay free of process
 * setup, sockets, and environment parsing.
 */
import { serve } from "@hono/node-server";
import { createJwtVerifier } from "@intentive/providers/auth";
import { WebSocketServer } from "ws";

import { loadConfig } from "./config/env.js";
import { createConnectHandler } from "./domains/gateway/service/connect.js";
import { attachGatewayWebSocketHandler } from "./domains/gateway/ui/ws-handler.js";
import { createInternalApp } from "./domains/internal/ui/app.js";
import { createInMemoryAgentInstanceRegistry } from "./domains/sessions/repo/instance-registry.js";
import { createStartSession } from "./domains/sessions/service/start-session.js";

const config = loadConfig();

const verifier = createJwtVerifier({
  jwks_url: config.neonAuth.jwksUrl,
  issuer: config.neonAuth.issuer,
  audience: config.neonAuth.audience,
});

const registry = createInMemoryAgentInstanceRegistry();
const startSession = createStartSession({
  registry,
  wsUrl: config.publicWsUrl,
});
const internalApp = createInternalApp({
  secret: config.internalInbound.secret,
  startSession,
});
const connectHandler = createConnectHandler({ verifier });

serve({ fetch: internalApp.fetch, port: config.internalInbound.port });

const wss = new WebSocketServer({ port: config.port });
wss.on("connection", (socket) => {
  attachGatewayWebSocketHandler(socket, connectHandler);
});

console.info(`Agent Runtime public WebSocket listening on :${config.port}`);
console.info(`Agent Runtime Internal API listening on :${config.internalInbound.port}`);
