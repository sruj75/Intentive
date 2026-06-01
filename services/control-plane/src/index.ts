/**
 * Control Plane composition root.
 *
 * Re-exports domain surfaces. Implementation lives under `src/domains/`; this
 * file only wires them together for the workspace's public entry point.
 */
export { controlPlaneContractSample } from "./domains/identity/types/account.js";
export {
  mapJwtVerificationErrorToHttpResponse,
  type ControlPlaneAuthErrorResponse,
} from "./domains/identity/service/auth-failure.js";
