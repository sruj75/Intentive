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

import { requireUser, type Authenticator } from "../../../http/auth.js";
import type { RegisterDeviceInput } from "../repo/devices.js";

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
      const auth = await requireUser(authorization, deps.identity);
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
