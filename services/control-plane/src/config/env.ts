/**
 * Control Plane configuration seam.
 *
 * The single place the service resolves environment settings. It enumerates and
 * validates the shape of every env var the Control Plane needs, then hands each
 * domain a typed slice — so no domain re-parses `process.env` (one source of
 * truth, no change amplification across #23/#26/#27/#30/#49).
 *
 * This module validates *shape only*. It holds no secret values, opens no
 * connections, and is safe to load in tests with a fake `env`. Real values are
 * provisioned into Cloud Run by #50.
 *
 * There is deliberately **no** runtime-JWT signing key: the `runtime_jwt`
 * returned by Routing is the client's pass-through Neon Auth token (control-plane ADR-0002),
 * verified by the one shared JWKS verifier (`packages/providers`, #15). The two
 * `INTERNAL_SECRET_*` vars are the Directional Secrets guarding the private
 * Internal HTTP surface — one per direction, never one symmetric password.
 */
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),

  // Neon (control-plane-owned schema + role; see services/control-plane/docs/ARCHITECTURE.md)
  NEON_DATABASE_URL: z.string().url(),
  NEON_DATABASE_ROLE: z.string().min(1).default("control_plane_app"),

  // Neon Auth — shared JWKS verifier config (user JWTs on public endpoints + pass-through runtime_jwt).
  // Where these three values come from (the JWKS-URL-per-provider table is the
  // non-obvious part): https://neon.com/docs/guides/neon-authorize#find-your-jwks-url
  NEON_AUTH_JWKS_URL: z.string().url(),
  NEON_AUTH_ISSUER: z.string().min(1),
  NEON_AUTH_AUDIENCE: z.string().min(1),

  // Internal HTTP surface — Directional Secrets (one per direction)
  RUNTIME_INTERNAL_BASE_URL: z.string().url(),
  INTERNAL_SECRET_TO_RUNTIME: z.string().min(1), // CP -> AR: POST /internal/sessions/start
  INTERNAL_SECRET_FROM_RUNTIME: z.string().min(1), // AR -> CP: POST /internal/notifications/push

  // APNs — Apple push credentials (held only here; the Agent Runtime never calls APNs)
  APNS_KEY_ID: z.string().min(1),
  APNS_TEAM_ID: z.string().min(1),
  APNS_BUNDLE_ID: z.string().min(1),
  APNS_PRIVATE_KEY: z.string().min(1),
});

export interface ControlPlaneConfig {
  readonly port: number;
  readonly neon: { readonly url: string; readonly role: string };
  readonly neonAuth: {
    readonly jwksUrl: string;
    readonly issuer: string;
    readonly audience: string;
  };
  readonly runtimeInternal: { readonly baseUrl: string; readonly secretToRuntime: string };
  readonly internalInbound: { readonly secretFromRuntime: string };
  readonly apns: {
    readonly keyId: string;
    readonly teamId: string;
    readonly bundleId: string;
    readonly privateKey: string;
  };
}

/**
 * Thrown when configuration is missing or malformed. Names only the offending
 * env var *keys* — never their values — because this runs at boot over secret
 * material and must not leak credentials into logs.
 */
export class ControlPlaneConfigError extends Error {
  override readonly name = "ControlPlaneConfigError";
  readonly invalidKeys: readonly string[];

  constructor(invalidKeys: readonly string[]) {
    super(`Control Plane configuration is invalid or missing: ${invalidKeys.join(", ")}`);
    this.invalidKeys = invalidKeys;
  }
}

/**
 * Parse and validate configuration from `env` (defaults to `process.env`).
 * Returns a frozen, grouped config object whose slices match the domain seams.
 * Fails fast with a {@link ControlPlaneConfigError} listing the offending keys.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ControlPlaneConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))].sort();
    throw new ControlPlaneConfigError(keys);
  }

  const e = parsed.data;
  return Object.freeze({
    port: e.PORT,
    neon: Object.freeze({ url: e.NEON_DATABASE_URL, role: e.NEON_DATABASE_ROLE }),
    neonAuth: Object.freeze({
      jwksUrl: e.NEON_AUTH_JWKS_URL,
      issuer: e.NEON_AUTH_ISSUER,
      audience: e.NEON_AUTH_AUDIENCE,
    }),
    runtimeInternal: Object.freeze({
      baseUrl: e.RUNTIME_INTERNAL_BASE_URL,
      secretToRuntime: e.INTERNAL_SECRET_TO_RUNTIME,
    }),
    internalInbound: Object.freeze({ secretFromRuntime: e.INTERNAL_SECRET_FROM_RUNTIME }),
    apns: Object.freeze({
      keyId: e.APNS_KEY_ID,
      teamId: e.APNS_TEAM_ID,
      bundleId: e.APNS_BUNDLE_ID,
      privateKey: e.APNS_PRIVATE_KEY,
    }),
  });
}
