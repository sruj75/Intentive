/**
 * Agent Runtime configuration seam.
 *
 * This is the single boot-time entry point for resolving environment settings.
 * It validates shape only, opens no connections, and names only invalid env var
 * keys on failure so secret values never leak into logs.
 */
import { z } from "zod";

const SentryModeSchema = z.enum(["errors-only", "errors-and-performance"]);
const LangfuseModeSchema = z.enum(["callback", "otel"]);
const AuthModeSchema = z.enum(["neon", "local-dev"]);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  INTERNAL_PORT: z.coerce.number().int().positive().default(8081),
  PUBLIC_WS_URL: z.string().url(),
  INTERNAL_SECRET_FROM_CONTROL_PLANE: z.string().min(1),
  CONTROL_PLANE_INTERNAL_BASE_URL: z.string().url(),
  INTERNAL_SECRET_TO_CONTROL_PLANE: z.string().min(1),
  NEON_DATABASE_URL: z.string().url(),
  NEON_DATABASE_ROLE: z.string().min(1).default("agent_runtime_app"),
  NEON_AUTH_JWKS_URL: z.string().url(),
  NEON_AUTH_ISSUER: z.string().min(1),
  NEON_AUTH_AUDIENCE: z.string().min(1),
  INTENTIVE_AUTH_MODE: AuthModeSchema.default("neon"),
  INTENTIVE_DEV_AUTH_SECRET: z.string().min(32).optional(),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  RUNTIME_MODEL: z.string().min(1).default("nvidia/nemotron-3-ultra-550b-a55b:free"),
  LANGFUSE_PUBLIC_KEY: z.string().min(1).optional(),
  LANGFUSE_SECRET_KEY: z.string().min(1).optional(),
  LANGFUSE_BASE_URL: z.string().url().optional(),
  LANGFUSE_MODE: LangfuseModeSchema.default("callback"),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().min(1).optional(),
  SENTRY_RELEASE: z.string().min(1).optional(),
  SENTRY_MODE: SentryModeSchema.default("errors-only"),
});

export interface AgentRuntimeConfig {
  /** Public WebSocket ingress listens on `port`; private Internal API ingress is firewall-isolable on `internalInbound.port`. */
  readonly port: number;
  readonly publicWsUrl: string;
  readonly internalInbound: { readonly port: number; readonly secret: string };
  readonly controlPlane: { readonly baseUrl: string; readonly internalSecret: string };
  readonly neon: { readonly url: string; readonly role: string };
  readonly neonAuth: {
    readonly jwksUrl: string;
    readonly issuer: string;
    readonly audience: string;
  };
  readonly auth: {
    readonly mode: "neon" | "local-dev";
    readonly localDevSecret?: string;
  };
  readonly model: {
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly model: string;
  };
  readonly langfuse: {
    readonly publicKey: string;
    readonly secretKey: string;
    readonly baseUrl?: string;
    readonly mode: "callback" | "otel";
  } | null;
  readonly sentry: {
    readonly dsn: string;
    readonly environment?: string;
    readonly release?: string;
    readonly mode: "errors-only" | "errors-and-performance";
  } | null;
}

/**
 * Thrown when configuration is missing or malformed. The error message names
 * only env var keys, never values, because this module validates secret-bearing
 * boot input.
 */
export class AgentRuntimeConfigError extends Error {
  override readonly name = "AgentRuntimeConfigError";
  readonly invalidKeys: readonly string[];

  constructor(invalidKeys: readonly string[]) {
    super(`Agent Runtime configuration is invalid or missing: ${invalidKeys.join(", ")}`);
    this.invalidKeys = invalidKeys;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentRuntimeConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))].sort();
    throw new AgentRuntimeConfigError(keys);
  }

  const e = parsed.data;
  if (e.INTENTIVE_AUTH_MODE === "local-dev" && !e.INTENTIVE_DEV_AUTH_SECRET) {
    throw new AgentRuntimeConfigError(["INTENTIVE_DEV_AUTH_SECRET"]);
  }

  return Object.freeze({
    port: e.PORT,
    publicWsUrl: e.PUBLIC_WS_URL,
    internalInbound: Object.freeze({
      port: e.INTERNAL_PORT,
      secret: e.INTERNAL_SECRET_FROM_CONTROL_PLANE,
    }),
    controlPlane: Object.freeze({
      baseUrl: e.CONTROL_PLANE_INTERNAL_BASE_URL,
      internalSecret: e.INTERNAL_SECRET_TO_CONTROL_PLANE,
    }),
    neon: Object.freeze({ url: e.NEON_DATABASE_URL, role: e.NEON_DATABASE_ROLE }),
    neonAuth: Object.freeze({
      jwksUrl: e.NEON_AUTH_JWKS_URL,
      issuer: e.NEON_AUTH_ISSUER,
      audience: e.NEON_AUTH_AUDIENCE,
    }),
    auth: Object.freeze({
      mode: e.INTENTIVE_AUTH_MODE,
      localDevSecret: e.INTENTIVE_DEV_AUTH_SECRET,
    }),
    model: Object.freeze({
      apiKey: e.OPENROUTER_API_KEY,
      baseUrl: e.OPENROUTER_BASE_URL,
      model: e.RUNTIME_MODEL,
    }),
    langfuse:
      e.LANGFUSE_PUBLIC_KEY && e.LANGFUSE_SECRET_KEY
        ? Object.freeze({
            publicKey: e.LANGFUSE_PUBLIC_KEY,
            secretKey: e.LANGFUSE_SECRET_KEY,
            baseUrl: e.LANGFUSE_BASE_URL,
            mode: e.LANGFUSE_MODE,
          })
        : null,
    sentry: e.SENTRY_DSN
      ? Object.freeze({
          dsn: e.SENTRY_DSN,
          environment: e.SENTRY_ENVIRONMENT,
          release: e.SENTRY_RELEASE,
          mode: e.SENTRY_MODE,
        })
      : null,
  });
}
