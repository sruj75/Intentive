/**
 * Control Plane workspace scaffold.
 *
 * Imports a shared API contract type so the workspace graph and contract
 * dependency chain are validated by monorepo typecheck.
 */
import type { GetMeResponse } from "@intentive/api-contract";

export const controlPlaneContractSample: GetMeResponse = {
  user_id: "user_stub",
  next_gate: null,
  has_agent_instance: false,
};
