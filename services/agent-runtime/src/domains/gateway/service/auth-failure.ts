import type { RuntimeError } from "@intentive/protocol";
import type { JwtVerificationFailure } from "@intentive/providers/auth";

export function mapJwtVerificationErrorToRuntimeError(error: JwtVerificationFailure): RuntimeError {
  if (error.reason === "jwks_unavailable") {
    return {
      type: "runtime_error",
      code: "service_unavailable",
      message: "Authentication is temporarily unavailable. Please retry shortly.",
    };
  }

  return {
    type: "runtime_error",
    code: "auth_failed",
    message: "Authentication failed.",
  };
}
