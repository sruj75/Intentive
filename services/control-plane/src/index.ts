/**
 * Control Plane workspace scaffold.
 *
 * Imports shared API contract so the workspace graph and contract dependency
 * chain are validated by monorepo typecheck.
 */
import { GetMeResponse } from "@intentive/api-contract";

export const controlPlaneContractSample: GetMeResponse = {
  user_id: "user_stub",
  next_gate: null,
  has_agent_instance: false,
};
