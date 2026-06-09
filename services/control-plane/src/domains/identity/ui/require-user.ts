/**
 * `requireUser` — the single definition of "this HTTP request is an
 * authenticated user".
 *
 * Every authenticated endpoint (`GET /me`, `POST /consent`,
 * `POST /sibling-invitation/skip`) needs the same three steps: pull the bearer
 * token, turn it into a user, and map an auth failure to a status. Inlining that
 * in each handler would spread the "what is an authenticated request" decision
 * across three places; this helper holds it in one. A handler calls it and
 * either gets a `userId` to act on or a ready-made error `response` to return.
 *
 * It depends only on the narrow `Authenticator` slice of the identity service
 * (just `authenticate`), so it neither knows nor cares about Account State.
 */
import { JwtVerificationError } from "@intentive/providers/auth";

import {
  mapJwtVerificationErrorToHttpResponse,
  type ControlPlaneAuthErrorResponse,
} from "../service/auth-failure.js";

export interface Authenticator {
  authenticate(token: string): Promise<{ userId: string }>;
}

export type RequireUserResult =
  | { ok: true; userId: string }
  | { ok: false; response: ControlPlaneAuthErrorResponse };

export async function requireUser(
  authorization: string | null,
  deps: { identity: Authenticator },
): Promise<RequireUserResult> {
  const token = bearerToken(authorization);
  if (token === null) {
    // No credential presented is an authentication failure. Reuse the mapper so
    // the 401 body has a single definition shared with verifier failures.
    return { ok: false, response: mapJwtVerificationErrorToHttpResponse({ reason: "malformed" }) };
  }

  try {
    const { userId } = await deps.identity.authenticate(token);
    return { ok: true, userId };
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return { ok: false, response: mapJwtVerificationErrorToHttpResponse(err) };
    }
    throw err;
  }
}

/**
 * Pull the token out of an `Authorization: Bearer <token>` header, or `null`
 * when the header is absent or not a bearer credential. The one definition of
 * how this service reads a bearer token, shared by `requireUser` and `GET /me`.
 */
export function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer (.+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}
