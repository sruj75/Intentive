/**
 * `POST /devices/register` handler — the HTTP boundary for the Device Registry.
 *
 * Transport-agnostic like the identity handlers: it takes the `Authorization`
 * header and the parsed JSON body and returns a plain `{ status, body }`. It
 * verifies the caller through the injected authenticator, maps the parsed
 * request onto the repo's register port for the authenticated user, and
 * validates the request and response at the boundary. Registration is idempotent
 * in the repo, so a re-`POST` is safe and returns the same `device_id`.
 *
 * It depends on the narrow `{ register }` slice of the devices repo — never the
 * token-bearing surface — so this handler cannot leak a push token.
 */
import {
  PostDeviceRegisterRequest,
  PostDeviceRegisterResponse,
  parseBoundary,
} from "@intentive/api-contract";
import { JwtVerificationError } from "@intentive/providers/auth";

import type { RegisterDeviceInput } from "../repo/devices.js";

interface Authenticator {
  authenticate(token: string): Promise<{ userId: string }>;
}

export interface PostDeviceRegisterRequestHttp {
  /** Raw `Authorization` header value, or null when absent. */
  authorization: string | null;
  /** Parsed JSON request body (validated here at the boundary). */
  body: unknown;
}

export interface PostDeviceRegisterResult {
  status: number;
  body: unknown;
}

export interface PostDeviceRegisterHandler {
  handle(req: PostDeviceRegisterRequestHttp): Promise<PostDeviceRegisterResult>;
}

export function createPostDeviceRegisterHandler(deps: {
  identity: Authenticator;
  devices: { registerDevice(input: RegisterDeviceInput): Promise<{ deviceId: string }> };
}): PostDeviceRegisterHandler {
  return {
    async handle({ authorization, body }) {
      const auth = await requireDeviceUser(authorization, deps.identity);
      if (!auth.ok) return auth.response;

      const req = parseBoundary(PostDeviceRegisterRequest, body ?? {});
      const { deviceId } = await deps.devices.registerDevice({
        userId: auth.userId,
        deviceFingerprint: req.device_fingerprint,
        clientKind: req.client_kind,
        apnsToken: req.apns_token,
        fcmToken: req.fcm_token,
      });

      return {
        status: 200,
        body: parseBoundary(PostDeviceRegisterResponse, { device_id: deviceId }),
      };
    },
  };
}

type AuthResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      response: {
        status: 401 | 503;
        body: { code: "auth_failed" | "service_unavailable"; message: string };
      };
    };

async function requireDeviceUser(
  authorization: string | null,
  identity: Authenticator,
): Promise<AuthResult> {
  const token = bearerToken(authorization);
  if (token === null) return { ok: false, response: authFailed() };

  try {
    const { userId } = await identity.authenticate(token);
    return { ok: true, userId };
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return {
        ok: false,
        response: err.reason === "jwks_unavailable" ? authUnavailable() : authFailed(),
      };
    }
    throw err;
  }
}

function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer (.+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function authFailed() {
  return {
    status: 401 as const,
    body: { code: "auth_failed" as const, message: "Authentication failed." },
  };
}

function authUnavailable() {
  return {
    status: 503 as const,
    body: {
      code: "service_unavailable" as const,
      message: "Authentication is temporarily unavailable. Please retry shortly.",
    },
  };
}
