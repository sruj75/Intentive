/**
 * Runtime Config — the single read of build-time / EAS environment for the
 * Mobile Client's composition root. It lives in `entrypoints/` (composition
 * only, off the pure node:test path) because it reads the `EXPO_PUBLIC_*` env
 * inlined at build time and `expo-constants` — platform capabilities the
 * domains never touch directly.
 *
 * Config source (resolved per the integration plan): the three public seams —
 * Control Plane base URL, Sentry DSN, and the public Google iOS client ID —
 * plus the Neon Auth base URL (read inside `auth/service/neon-client.ts`) come
 * from `EXPO_PUBLIC_*` env, inlined by Expo at build time and populated from EAS
 * env in CI/release. `.env.example` documents each one. Leaving a value blank
 * keeps that seam dormant: no Control Plane base URL ⇒ the account/launch
 * sources short-circuit; no Sentry DSN ⇒ telemetry stays the no-op.
 *
 * Production auth is Google-only (ADR 0030): `googleAuthConfigured` is the one
 * capability, derived from both public client IDs. A production / internal-
 * production build (anything but `__DEV__`) whose either Google client ID is
 * missing fails to resolve config, preventing an unusable binary from shipping.
 */
import Constants from "expo-constants";

export interface RuntimeConfig {
  /** Control Plane base URL (public HTTPS), or "" when the seam is dormant. */
  readonly controlPlaneBaseUrl: string;
  /** Public Sentry client DSN, or "" to keep telemetry disabled. */
  readonly sentryDsn: string;
  /** Public Google iOS OAuth client ID, or "" until native auth is configured. */
  readonly googleIosClientId: string;
  /** Public Google web OAuth client ID used as the native ID-token audience. */
  readonly googleWebClientId: string;
  /** Sentry environment tag and general build environment label. */
  readonly environment: string;
  /** Client version reported to the Agent Runtime `connect` handshake. */
  readonly clientVersion: string;
  /** Expo `__DEV__` — labels the build environment. */
  readonly isDev: boolean;
  /** Whether Google is a working sign-in capability (both public client IDs present). */
  readonly googleAuthConfigured: boolean;
}

declare const __DEV__: boolean;

export function createRuntimeConfig(): RuntimeConfig {
  const isDev = typeof __DEV__ === "boolean" ? __DEV__ : false;
  // Expo only inlines EXPO_PUBLIC values when accessed with static dot notation.
  // Keep these reads explicit; computed `process.env[name]` access is not replaced
  // in release bundles.
  const controlPlaneBaseUrl = process.env.EXPO_PUBLIC_CONTROL_PLANE_BASE_URL?.trim() ?? "";
  const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? "";
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "";
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "";

  // Native Google needs both client IDs: iOS identifies the app and the web
  // client is the ID-token audience Neon Auth verifies. The iOS value also
  // installs the native config plugin.
  const googleAuthConfigured = googleIosClientId.length > 0 && googleWebClientId.length > 0;

  // A production / internal-production build without either Google client ID is
  // unusable: the Identity Gate could only offer a disabled button. Fail config
  // resolution so such a binary can never ship (ADR 0030). Dev builds keep the
  // dormant-capability path so the local offline walk and tests stay green.
  if (!isDev && !googleAuthConfigured) {
    throw new Error(
      "Production auth is misconfigured: both EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID and " +
        "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must be present to ship a production build.",
    );
  }

  return {
    controlPlaneBaseUrl,
    sentryDsn,
    googleIosClientId,
    googleWebClientId,
    environment: isDev ? "development" : "production",
    clientVersion: Constants.expoConfig?.version ?? "0.0.0",
    isDev,
    googleAuthConfigured,
  };
}
