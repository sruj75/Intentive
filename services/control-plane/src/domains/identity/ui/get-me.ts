/**
 * `GET /me` handler — the HTTP boundary for identity.
 *
 * Transport-agnostic: it takes the `Authorization` header and returns a plain
 * `{ status, body }`, so it is unit-testable without a socket and reusable under
 * any server. It owns exactly the HTTP concerns the service refuses to: pulling
 * the bearer token, turning a `JwtVerificationError` into a status (via the
 * existing mapper), and validating the outgoing body at the boundary.
 */
import { AccountState, parseBoundary } from "@intentive/api-contract";

import {
  authErrorResponse,
  bearerToken,
  mapJwtVerificationErrorToHttpResponse,
} from "../../../http/auth.js";
import { readDeviceSignal } from "../../../http/device-signal.js";
import type { IdentityService } from "../service/resolve-account.js";

export interface GetMeRequest {
  /** Raw `Authorization` header value, or null when absent. */
  authorization: string | null;
  /** Raw `X-Client-Kind` header value, or null when absent. */
  clientKind?: string | null;
  /** Raw `X-Capture-Permission-Granted` header value, or null when absent. */
  capturePermissionGranted?: string | null;
}

export interface GetMeResult {
  status: number;
  body: unknown;
}

export interface GetMeHandler {
  handle(req: GetMeRequest): Promise<GetMeResult>;
}

export function createGetMeHandler(deps: { identity: IdentityService }): GetMeHandler {
  return {
    async handle(req) {
      const token = bearerToken(req.authorization);
      if (token === null) {
        // No credential presented is an authentication failure. Reuse the mapper
        // so the 401 body has a single definition shared with verifier failures.
        return mapJwtVerificationErrorToHttpResponse({ reason: "malformed" });
      }

      try {
        const account = await deps.identity.resolveAccount(token, readDeviceSignal(req));
        // Parse on the way out too: the response can only leave as a valid
        // AccountState (parse-at-boundary, docs/CONVENTIONS.md).
        return { status: 200, body: parseBoundary(AccountState, account) };
      } catch (err) {
        const response = authErrorResponse(err);
        if (response) return response;
        throw err;
      }
    },
  };
}
