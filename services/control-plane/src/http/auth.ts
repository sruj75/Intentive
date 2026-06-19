/**
 * Authenticated-HTTP-request boundary — the one definition of "this HTTP request
 * carries a valid user" for the Control Plane.
 *
 * Every authenticated endpoint (`GET /me`, `GET /agent`, `POST /consent`,
 * `POST /sibling-invitation/skip`, `POST /devices/register`) makes the same
 * decisions: pull the bearer token, turn an auth failure into a status, and (for
 * most) resolve the token to a user. The layer rule forbids one domain's `ui`
 * importing another's, so these were copied across three domains' handlers and
 * had already drifted (two different 503 bodies). This module — service-local
 * under `src/http/`, so exempt from the layer rule and the cross-domain ban like
 * `src/main.ts` — holds them once. HTTP-status mapping stays here and not in
 * `packages/providers`: it is transport-specific (the Agent Runtime maps the
 * same `JwtVerificationFailure` to a protocol event, not a status).
 */
import { timingSafeEqual } from "node:crypto";

import { JwtVerificationError, type JwtVerificationFailure } from "@intentive/providers/auth";

export interface ControlPlaneAuthErrorResponse {
  status: 401 | 503;
  body: {
    code: "auth_failed" | "service_unavailable";
    message: string;
  };
}

/** The 401 every missing/invalid credential collapses to — one body, no leak. */
export function authFailed(): ControlPlaneAuthErrorResponse {
  return {
    status: 401,
    body: {
      code: "auth_failed",
      message: "Authentication failed.",
    },
  };
}

/**
 * The single canonical 503 for a transient auth-path outage (JWKS unreachable).
 * One body shared by every caller — this resolves the drift where get-agent
 * answered "The service is temporarily unavailable…" and the identity mapper
 * answered "Authentication is temporarily unavailable…".
 */
export function serviceUnavailable(): ControlPlaneAuthErrorResponse {
  return {
    status: 503,
    body: {
      code: "service_unavailable",
      message: "Authentication is temporarily unavailable. Please retry shortly.",
    },
  };
}

/**
 * Map a verification failure to its HTTP response: a JWKS outage is a retryable
 * 503, every other reason is a 401. Delegates to the two factories so the bodies
 * have a single definition.
 */
export function mapJwtVerificationErrorToHttpResponse(
  error: JwtVerificationFailure,
): ControlPlaneAuthErrorResponse {
  return error.reason === "jwks_unavailable" ? serviceUnavailable() : authFailed();
}

/**
 * Pull the token out of an `Authorization: Bearer <token>` header, or `null`
 * when the header is absent or not a bearer credential. The one definition of
 * how this service reads a bearer token.
 */
export function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer (.+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

/**
 * Map a caught error to an auth response, or `null` when it is not an auth
 * failure (the caller rethrows). A handler that has already pulled the token and
 * called the service wraps its catch in this:
 * `const r = authErrorResponse(err); if (r) return r; throw err;`.
 */
export function authErrorResponse(err: unknown): ControlPlaneAuthErrorResponse | null {
  if (err instanceof JwtVerificationError) {
    return mapJwtVerificationErrorToHttpResponse(err);
  }
  return null;
}

/** The narrow slice of the identity service `requireUser` needs — just verify. */
export interface Authenticator {
  authenticate(token: string): Promise<{ userId: string }>;
}

export type RequireUserResult =
  | { ok: true; userId: string }
  | { ok: false; response: ControlPlaneAuthErrorResponse };

export type RequireInternalSecretResult =
  | { authenticated: true }
  | { authenticated: false; response: ControlPlaneAuthErrorResponse };

/**
 * Resolve an `Authorization` header to a `userId`, or a ready-made error
 * response. The whole "is this an authenticated request" decision in one place:
 * no token is a 401, a verifier failure maps via {@link authErrorResponse}, and
 * anything else rethrows. Takes the bare `Authenticator` so handlers can pass
 * `deps.identity` straight in.
 */
export async function requireUser(
  authorization: string | null,
  authenticator: Authenticator,
): Promise<RequireUserResult> {
  const token = bearerToken(authorization);
  if (token === null) {
    // No credential presented is an authentication failure, with the same 401
    // body as a malformed-token verifier failure.
    return { ok: false, response: authFailed() };
  }

  try {
    const { userId } = await authenticator.authenticate(token);
    return { ok: true, userId };
  } catch (err) {
    const response = authErrorResponse(err);
    if (response) return { ok: false, response };
    throw err;
  }
}

/**
 * Authenticate private Internal HTTP calls with a Directional Secret carried as a
 * bearer token. The caller decides which expected secret applies, so CP<-Runtime
 * and maintenance ingress stay separate without duplicating the status mapping.
 */
export function requireInternalSecret(
  authorization: string | null,
  expectedSecret: string,
): RequireInternalSecretResult {
  const token = bearerToken(authorization);
  if (token === null) return { authenticated: false, response: authFailed() };
  return constantTimeEqual(token, expectedSecret)
    ? { authenticated: true }
    : { authenticated: false, response: authFailed() };
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
