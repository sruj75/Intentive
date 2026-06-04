import type { JwtVerificationFailure } from "@intentive/providers/auth";

export interface ControlPlaneAuthErrorResponse {
  status: 401 | 503;
  body: {
    code: "auth_failed" | "service_unavailable";
    message: string;
  };
}

export function mapJwtVerificationErrorToHttpResponse(
  error: JwtVerificationFailure,
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
