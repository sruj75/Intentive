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
 * from `EXPO_PUBLIC_*` env, inlined by
 * Expo at build time and populated from EAS env in CI/release. `.env.example`
 * documents each one. Leaving a value blank keeps that seam dormant: no Control
 * Plane base URL ⇒ the account/launch sources short-circuit; no Sentry DSN ⇒
 * telemetry stays the no-op.
 */
import Constants from "expo-constants";

import type { SocialProvider } from "../domains/auth/service/ports";

export interface RuntimeConfig {
  /** Control Plane base URL (public HTTPS), or "" when the seam is dormant. */
  readonly controlPlaneBaseUrl: string;
  /** Public Sentry client DSN, or "" to keep telemetry disabled. */
  readonly sentryDsn: string;
  /** Public Google iOS OAuth client ID, or "" until native auth is configured. */
  readonly googleIosClientId: string;
  /** Sentry environment tag and general build environment label. */
  readonly environment: string;
  /** Client version reported to the Agent Runtime `connect` handshake. */
  readonly clientVersion: string;
  /** Expo `__DEV__` — gates the launch-only dev auth provider. */
  readonly isDev: boolean;
  /** Social providers that are a working sign-in capability today. */
  readonly enabledAuthProviders: ReadonlySet<SocialProvider>;
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
  return {
    controlPlaneBaseUrl,
    sentryDsn,
    googleIosClientId,
    environment: isDev ? "development" : "production",
    clientVersion: Constants.expoConfig?.version ?? "0.0.0",
    isDev,
    // The public iOS client ID is the deliberate internal-TestFlight gate: it
    // both installs the native config plugin and permits the Auth Adapter to
    // exercise Google. Apple remains disabled. External release still waits on
    // the physical-device proof documented in RELEASE.md.
    enabledAuthProviders: new Set<SocialProvider>(googleIosClientId ? ["google"] : []),
  };
}
