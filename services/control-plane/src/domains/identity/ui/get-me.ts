/**
 * `GET /me` handler — the HTTP boundary for identity.
 *
 * Transport-agnostic: it takes the `Authorization` header and returns a plain
 * `{ status, body }`, so it is unit-testable without a socket and reusable under
 * any server. It owns exactly the HTTP concerns the service refuses to: pulling
 * the bearer token, turning a `JwtVerificationError` into a status (via the
 * existing mapper), and validating the outgoing body at the boundary.
 */
import { AccountState, GetMeDeviceSignal, parseBoundary } from "@intentive/api-contract";
import { JwtVerificationError } from "@intentive/providers/auth";

import { mapJwtVerificationErrorToHttpResponse } from "../service/auth-failure.js";
import type { IdentityService } from "../service/resolve-account.js";
import { bearerToken } from "./require-user.js";

export interface GetMeRequest {
  /** Raw `Authorization` header value, or null when absent. */
  authorization: string | null;
  /** Raw `X-Client-Kind` header value, or null when absent. */
  clientKind?: string | null;
  /** Raw `X-Capture-Permission-Granted` header value, or null when absent. */
  capturePermissionGranted?: string | null;
}

/**
 * Parse the optional device signal from its raw header values (ADR-0005). A
 * malformed header is *not* a 400: `GET /me` is the hot path and must stay
 * answerable, so an unparseable signal degrades to "no signal" — the
 * cross-client-only gate sequence — exactly as an unregistered/legacy caller
 * that sends no headers at all.
 */
function readDeviceSignal(req: GetMeRequest): GetMeDeviceSignal {
  const raw: Record<string, string> = {};
  if (req.clientKind != null) raw.client_kind = req.clientKind;
  if (req.capturePermissionGranted != null) {
    raw.capture_permission_granted = req.capturePermissionGranted;
  }
  const parsed = GetMeDeviceSignal.safeParse(raw);
  return parsed.success ? parsed.data : {};
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
        if (err instanceof JwtVerificationError) {
          return mapJwtVerificationErrorToHttpResponse(err);
        }
        throw err;
      }
    },
  };
}
