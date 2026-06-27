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
import { createJwtVerifier, createLocalDevJwtVerifier } from "@intentive/providers/auth";
import { bootstrapObservability } from "@intentive/providers/observability";
import { neon } from "@neondatabase/serverless";

import { loadConfig } from "./config/env.js";
import type { Sql } from "./db/sql.js";
import { createReadiness } from "./http/readiness.js";
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
const observability = bootstrapObservability({
  sentry: config.sentry,
  langfuse: null,
});
const log = observability.createLogger("control-plane");

// Construct the verifier once: it closes over a lazily-fetched JWKS cache, so a
// per-request verifier would defeat the cache and hammer Neon Auth.
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

const sql = neon(config.neon.url) as unknown as Sql;
// Request-path repos read Neon over the serverless HTTP driver. On a network
// without IPv6 egress (Neon hosts are dual-stack), a transient connect blip
// otherwise fails the whole request — e.g. `GET /agent` → `resolveUser` →
// `NeonDbError` → `500`. Retry transient connection errors; every CP query is a
// read or an idempotent upsert, so a re-run is safe. Readiness stays on the raw
// `sql` so `/ready` keeps its fail-fast cold-start signal.
const resilientSql = withQueryRetry(sql);
const users = createUsersRepo(resilientSql);
const userGates = createUserGatesRepo(resilientSql);
const devices = createDevicesRepo(resilientSql);
const notificationTickets = createNotificationTicketsRepo(resilientSql);
const expoPushSender = createExpoPushSender({ accessToken: config.expo.accessToken });
const agentInstances = createAgentInstancesRepo(resilientSql);
const readiness = createReadiness({ sql, verifier });
const runtimeSessionStarter = createRuntimeSessionStarter({
  baseUrl: config.runtimeInternal.baseUrl,
  secret: config.runtimeInternal.secretToRuntime,
});
const agents = createAgentsService({
  sessionStarter: runtimeSessionStarter,
  instances: agentInstances,
  logger: log,
});
const gates = createGatesService({ userGates, logger: log });
// identity gets the narrow agents *read* port — never the Runtime-calling write
// surface — so it stays a pure reader and there is no dependency cycle.
const identity = createIdentityService({ verifier, users, gates, devices, agents, logger: log });
const getMe = createGetMeHandler({ identity });
const postConsent = createPostConsentHandler({ identity, gates });
const postSiblingInvitationSkip = createPostSiblingInvitationSkipHandler({ identity, gates });
const postDeviceRegister = createPostDeviceRegisterHandler({ identity, devices, logger: log });
const getAgent = createGetAgentHandler({ identity, agents });
const notifications = createNotificationsService({
  devices,
  sender: expoPushSender,
  tickets: notificationTickets,
  logger: log,
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
  readiness,
});

serve({ fetch: app.fetch, port: config.port });
log.info("service_started", { status: "ok" });

/**
 * Wrap a `Sql` so each query retries on transient Neon connection errors. CP
 * queries are reads or idempotent upserts (`ON CONFLICT`), so re-running a failed
 * attempt is safe. This absorbs the dual-stack/IPv6 connect blips that otherwise
 * surface as a request-failing `NeonDbError`.
 */
function withQueryRetry(base: Sql): Sql {
  return (<Row = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<Row[]> => retryTransientDb(() => base<Row>(strings, ...values))) as Sql;
}

async function retryTransientDb<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === 5 || !isTransientDbError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

function isTransientDbError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  if (code === "ETIMEDOUT" || code === "EHOSTUNREACH") return true;
  const nested = (error as { errors?: unknown }).errors;
  if (Array.isArray(nested) && nested.some((item) => isTransientDbError(item))) return true;
  return (
    error.name === "NeonDbError" ||
    error.message.includes("fetch failed") ||
    error.message.includes("ETIMEDOUT") ||
    error.message.includes("EHOSTUNREACH")
  );
}
