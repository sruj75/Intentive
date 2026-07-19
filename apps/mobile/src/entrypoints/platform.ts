/**
 * Composition Root — the single place the Mobile Client's dormant production
 * adapters are constructed with real platform capabilities (Neon Auth client,
 * global `fetch`, telemetry, EAS config). Imported only by `app/` route files
 * and `src/entrypoints/*`; domains never reach across to it (layer rule:
 * entrypoints compose, domains depend forward).
 *
 * Everything is built once and shared behind `getPlatform()`, so every seam
 * reads the same Control Plane base URL, the same **User JWT** token-getter
 * (`getUserJwt`, sourced from the Auth Adapter — never the dev fake), the same
 * `fetch`, and the same telemetry instance. Telemetry is initialized here so a
 * blank DSN cleanly yields the no-op; the auth and runtime adapters receive it
 * rather than defaulting to `noopTelemetry` in production.
 */
import { createAuthAdapter } from "../domains/auth/service/auth-adapter";
import { createNeonAuthClient } from "../domains/auth/service/neon-client";
import type { AuthAdapter } from "../domains/auth/types/auth";
import { createControlPlaneAccountStateSource } from "../providers/account-state";
import type { AccountStateSource } from "../providers/account-state";
import { createControlPlaneLaunchStateSource } from "../providers/launch-state";
import type { LaunchStateSource } from "../providers/launch-state";
import { createRuntimeConversationSession } from "../domains/chat/runtime/runtime-conversation-session";
import type { WebSocketLike } from "../domains/chat/runtime/runtime-adapter";
import type { ConversationSession } from "../domains/chat/types/conversation-timeline";
import { getOrCreateDeviceFingerprint } from "../domains/notifications/repo/device-fingerprint";
import { createExpoNotificationsPort } from "../domains/notifications/repo/expo-notifications-port";
import {
  registerForPush as runPushRegistration,
  type PushRegistrationResult,
} from "../domains/notifications/service/push-registration";
import { createSentryTelemetry, initTelemetry } from "../providers/telemetry";
import type { Telemetry } from "../providers/telemetry/types";
import { createRuntimeConfig, type RuntimeConfig } from "./runtime-config";

/** The shared fetch surface the Control Plane sources depend on. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export interface FetchLike {
  (url: string, init?: { headers?: Record<string, string> }): Promise<FetchResponseLike>;
}

export interface Platform {
  readonly config: RuntimeConfig;
  readonly telemetry: Telemetry;
  readonly auth: AuthAdapter;
  /** The **User JWT** token-getter every Control-Plane-backed seam consumes. */
  readonly getUserJwt: () => Promise<string | null>;
  readonly fetch: FetchLike;
  readonly launchStateSource: LaunchStateSource;
  readonly accountStateSource: AccountStateSource;
  /**
   * Builds a fresh Agent-Runtime-backed chat session per call (each opens its own
   * connection and must be `dispose`d on unmount). Injected by the `(main)` route
   * in place of the offline `createLocalConversationSession` default.
   */
  readonly createRuntimeSession: () => ConversationSession;
  /**
   * Requests notification permission and registers this device for push with the
   * Control Plane (`POST /devices/register`). Mounted from the `(main)` layout once
   * the client is signed in; a denial or missing token resolves without a crash.
   */
  readonly registerForPush: () => Promise<PushRegistrationResult>;
}

/** Per-client idempotency key for outbound user messages (not a security token). */
function createMessageId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createPlatform(): Platform {
  const config = createRuntimeConfig();

  // Telemetry first, so the adapters below capture into the real instance
  // (a blank DSN keeps it the no-op — see initTelemetry).
  initTelemetry({ dsn: config.sentryDsn, environment: config.environment });
  const telemetry = createSentryTelemetry();

  const neonClient = createNeonAuthClient();
  const auth = createAuthAdapter({
    client: neonClient,
    enabled: config.enabledAuthProviders,
    includeDev: config.isDev,
    telemetry,
  });
  const getUserJwt = () => auth.getUserJwt();

  const fetch: FetchLike = (url, init) =>
    globalThis.fetch(url, init) as unknown as Promise<FetchResponseLike>;

  const sourceDeps = { baseUrl: config.controlPlaneBaseUrl, getUserJwt, fetch };
  // One shared `GET /me` reader feeds both Launch State (cold-launch navigation)
  // and the Account State projection (feature gating), so the seam is built once.
  const accountStateSource = createControlPlaneAccountStateSource(sourceDeps);
  const launchStateSource = createControlPlaneLaunchStateSource({
    ...sourceDeps,
    accountStateSource,
  });

  const createRuntimeSession = (): ConversationSession =>
    createRuntimeConversationSession({
      baseUrl: config.controlPlaneBaseUrl,
      getUserJwt,
      fetch,
      createWebSocket: (url) => new WebSocket(url) as unknown as WebSocketLike,
      clientVersion: config.clientVersion,
      now: () => new Date().toISOString(),
      id: createMessageId,
      schedule: (fn, delayMs) => {
        const timer = setTimeout(fn, delayMs);
        return { cancel: () => clearTimeout(timer) };
      },
      telemetry,
    });

  const registerForPush = (): Promise<PushRegistrationResult> =>
    runPushRegistration({
      baseUrl: config.controlPlaneBaseUrl,
      getUserJwt,
      fetch,
      notifications: createExpoNotificationsPort(),
      getDeviceFingerprint: getOrCreateDeviceFingerprint,
      onError: (error) => telemetry.captureException(error, { tags: { seam: "notifications" } }),
    });

  return {
    config,
    telemetry,
    auth,
    getUserJwt,
    fetch,
    launchStateSource,
    accountStateSource,
    createRuntimeSession,
    registerForPush,
  };
}

let cached: Platform | null = null;

/** The shared Mobile Client composition root, built lazily on first read. */
export function getPlatform(): Platform {
  return (cached ??= createPlatform());
}
