/**
 * Runtime Config — the single read of build-time / EAS environment for the
 * Mobile Client's composition root. It lives in `entrypoints/` (composition
 * only, off the pure node:test path) because it reads the `EXPO_PUBLIC_*` env
 * inlined at build time and `expo-constants` — platform capabilities the
 * domains never touch directly.
 *
 * Config source (resolved per the integration plan): the three public seams —
 * Control Plane base URL, Sentry DSN, and the Neon Auth base URL (read inside
 * `auth/service/neon-client.ts`) — come from `EXPO_PUBLIC_*` env, inlined by
 * Expo at build time and populated from EAS env in CI/release. `.env.example`
 * documents each one. Leaving a value blank keeps that seam dormant: no Control
 * Plane base URL ⇒ the account/launch sources short-circuit; no Sentry DSN ⇒
 * telemetry stays the no-op.
 */
import Constants from "expo-constants";

import { NEON_ENABLED_PROVIDERS } from "../domains/auth/service/neon-client";
import type { SocialProvider } from "../domains/auth/service/ports";

export interface RuntimeConfig {
  /** Control Plane base URL (public HTTPS), or "" when the seam is dormant. */
  readonly controlPlaneBaseUrl: string;
  /** Public Sentry client DSN, or "" to keep telemetry disabled. */
  readonly sentryDsn: string;
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

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function createRuntimeConfig(): RuntimeConfig {
  const isDev = typeof __DEV__ === "boolean" ? __DEV__ : false;
  return {
    controlPlaneBaseUrl: readEnv("EXPO_PUBLIC_CONTROL_PLANE_BASE_URL"),
    sentryDsn: readEnv("EXPO_PUBLIC_SENTRY_DSN"),
    environment: isDev ? "development" : "production",
    clientVersion: Constants.expoConfig?.version ?? "0.0.0",
    isDev,
    enabledAuthProviders: NEON_ENABLED_PROVIDERS,
  };
}
