/**
 * Control Plane composition root.
 *
 * Re-exports domain surfaces. Implementation lives under `src/domains/`; this
 * file only wires them together for the workspace's public entry point.
 */
export { loadConfig, ControlPlaneConfigError, type ControlPlaneConfig } from "./config/env.js";

export { controlPlaneContractSample } from "./domains/identity/types/account.js";
export {
  mapJwtVerificationErrorToHttpResponse,
  type ControlPlaneAuthErrorResponse,
} from "./domains/identity/service/auth-failure.js";

export { sessionStartRequestSample } from "./domains/agents/types/registry.js";
export {
  deviceRegisterRequestSample,
  deviceRegisterResponseSample,
} from "./domains/devices/types/registry.js";
export {
  accountStateSample,
  nextGateSample,
  consentRequestSample,
  siblingInvitationSkipRequestSample,
} from "./domains/gates/types/state.js";
export { routingSample } from "./domains/routing/types/routing.js";
export {
  notificationsPushRequestSample,
  notificationsPushResponseSample,
} from "./domains/notifications/types/push.js";
