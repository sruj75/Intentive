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

export interface ControlPlaneAuthErrorResponse {
  status: 401 | 503;
  body: {
    code: "auth_failed" | "service_unavailable";
    message: string;
  };
}

export function mapJwtVerificationErrorToHttpResponse(
  error: JwtVerificationFailureLike,
): ControlPlaneAuthErrorResponse {
  if (error.reason === "jwks_unavailable") {
    return {
      status: 503,
      body: {
        code: "service_unavailable",
        message: "Authentication is temporarily unavailable. Please retry shortly.",
      },
    };
  }

  return {
    status: 401,
    body: {
      code: "auth_failed",
      message: "Authentication failed.",
    },
  };
}
