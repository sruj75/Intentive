/**
 * devices domain — Device Registry shapes. Typed against the shared API
 * contract so the idempotent registration request/response (device fingerprint,
 * client_kind, APNs/FCM token → device_id) are validated by monorepo typecheck.
 * Behavior (idempotent storage, token rotation) lands in #27.
 */
import type {
  PostDeviceRegisterRequest,
  PostDeviceRegisterResponse,
} from "@intentive/api-contract";

export const deviceRegisterRequestSample: PostDeviceRegisterRequest = {
  device_fingerprint: "device_stub",
  client_kind: "mobile",
};

export const deviceRegisterResponseSample: PostDeviceRegisterResponse = {
  device_id: "device_stub",
};
