/**
 * Control Plane process entry — the composition root.
 *
 * The one place allowed to wire a cross-cutting provider (the JWKS verifier) and
 * the Neon driver into a domain. It builds each collaborator once, in dependency
 * order, and serves the Hono app. Sits outside `domains/` so it is exempt from
 * the forward-only layer rule (it composes across layers by design). Keep it
 * thin: construction only, no domain logic.
 */
import { serve } from "@hono/node-server";
import { createJwtVerifier } from "@intentive/providers/auth";
import { neon } from "@neondatabase/serverless";

import { loadConfig } from "./config/env.js";
import type { Sql } from "./db/sql.js";
import { createAgentInstancesRepo } from "./domains/agents/repo/agent-instances.js";
import { createRuntimeSessionStarter } from "./domains/agents/repo/runtime-session-start.js";
import { createAgentsService } from "./domains/agents/service/agents-service.js";
import { createDevicesRepo } from "./domains/devices/repo/devices.js";
import { createPostDeviceRegisterHandler } from "./domains/devices/ui/post-device-register.js";
import { createUserGatesRepo } from "./domains/gates/repo/user-gates.js";
import { createGatesService } from "./domains/gates/service/gates-service.js";
import { createUsersRepo } from "./domains/identity/repo/users.js";
import { createIdentityService } from "./domains/identity/service/resolve-account.js";
import { createApp } from "./domains/identity/ui/app.js";
import { createGetMeHandler } from "./domains/identity/ui/get-me.js";
import { createPostConsentHandler } from "./domains/identity/ui/post-consent.js";
import { createPostSiblingInvitationSkipHandler } from "./domains/identity/ui/post-sibling-invitation-skip.js";
import { createExpoPushSender } from "./domains/notifications/repo/expo-push-sender.js";
import { createNotificationTicketsRepo } from "./domains/notifications/repo/notification-tickets.js";
import { createNotificationsService } from "./domains/notifications/service/notifications-service.js";
import { createPostInternalNotificationsCheckReceiptsHandler } from "./domains/notifications/ui/post-internal-notifications-check-receipts.js";
import { createPostInternalNotificationsPushHandler } from "./domains/notifications/ui/post-internal-notifications-push.js";
import { createGetAgentHandler } from "./domains/routing/ui/get-agent.js";

const config = loadConfig();

// Construct the verifier once: it closes over a lazily-fetched JWKS cache, so a
// per-request verifier would defeat the cache and hammer Neon Auth.
const verifier = createJwtVerifier({
  jwks_url: config.neonAuth.jwksUrl,
  issuer: config.neonAuth.issuer,
  audience: config.neonAuth.audience,
});

const sql = neon(config.neon.url) as unknown as Sql;
const users = createUsersRepo(sql);
const userGates = createUserGatesRepo(sql);
const devices = createDevicesRepo(sql);
const notificationTickets = createNotificationTicketsRepo(sql);
const expoPushSender = createExpoPushSender({ accessToken: config.expo.accessToken });
const agentInstances = createAgentInstancesRepo(sql);
const runtimeSessionStarter = createRuntimeSessionStarter({
  baseUrl: config.runtimeInternal.baseUrl,
  secret: config.runtimeInternal.secretToRuntime,
});
const agents = createAgentsService({
  sessionStarter: runtimeSessionStarter,
  instances: agentInstances,
});
const gates = createGatesService({ userGates });
// identity gets the narrow agents *read* port — never the Runtime-calling write
// surface — so it stays a pure reader and there is no dependency cycle.
const identity = createIdentityService({ verifier, users, gates, devices, agents });
const getMe = createGetMeHandler({ identity });
const postConsent = createPostConsentHandler({ identity, gates });
const postSiblingInvitationSkip = createPostSiblingInvitationSkipHandler({ identity, gates });
const postDeviceRegister = createPostDeviceRegisterHandler({ identity, devices });
const getAgent = createGetAgentHandler({ identity, agents });
const notifications = createNotificationsService({
  devices,
  sender: expoPushSender,
  tickets: notificationTickets,
});
const postInternalNotificationsPush = createPostInternalNotificationsPushHandler({
  expectedSecret: config.internalInbound.secretFromRuntime,
  notifications,
});
const postInternalNotificationsCheckReceipts = createPostInternalNotificationsCheckReceiptsHandler({
  expectedSecret: config.internalInbound.secretForMaintenance,
  notifications,
});
const app = createApp({
  getMe,
  postConsent,
  postSiblingInvitationSkip,
  postDeviceRegister,
  getAgent,
  postInternalNotificationsPush,
  postInternalNotificationsCheckReceipts,
});

serve({ fetch: app.fetch, port: config.port });
console.info(`Control Plane listening on :${config.port}`);
