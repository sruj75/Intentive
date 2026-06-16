/**
 * Agent Runtime configuration seam.
 *
 * This is the single boot-time entry point for resolving environment settings.
 * It validates shape only, opens no connections, and names only invalid env var
 * keys on failure so secret values never leak into logs.
 */
import { z } from "zod";

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
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  RUNTIME_MODEL: z.string().min(1).default("nvidia/nemotron-3-ultra-550b-a55b:free"),
  LANGFUSE_PUBLIC_KEY: z.string().min(1).optional(),
  LANGFUSE_SECRET_KEY: z.string().min(1).optional(),
  LANGFUSE_BASE_URL: z.string().url().optional(),
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
  readonly model: {
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly model: string;
  };
  readonly langfuse: {
    readonly publicKey: string;
    readonly secretKey: string;
    readonly baseUrl?: string;
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
          })
        : null,
  });
}
