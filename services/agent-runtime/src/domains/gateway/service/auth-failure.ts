import type { RuntimeError } from "@intentive/protocol";

type JwtVerificationReason =
  | "expired"
  | "invalid_signature"
  | "wrong_issuer"
  | "wrong_audience"
  | "unknown_key"
  | "jwks_unavailable"
  | "malformed";

interface JwtVerificationFailureLike {
  reason: JwtVerificationReason;
}

export function mapJwtVerificationErrorToRuntimeError(
  error: JwtVerificationFailureLike,
): RuntimeError {
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
