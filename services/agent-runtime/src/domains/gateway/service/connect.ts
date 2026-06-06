import {
  safeParseClientToRuntimeEvent,
  type RuntimeError,
  type RuntimeToClientEvent,
} from "@intentive/protocol";
import type { JwtVerificationFailure, JwtVerifier } from "@intentive/providers/auth";

import { mapJwtVerificationErrorToRuntimeError } from "./auth-failure.js";

export interface ConnectHandlerResult {
  readonly response: RuntimeToClientEvent;
  readonly closeSocket: boolean;
}

export interface ConnectHandler {
  handle(raw: unknown): Promise<ConnectHandlerResult>;
}

const invalidConnect: RuntimeError = {
  type: "runtime_error",
  code: "invalid_connect",
  message: "First WebSocket event must be connect.",
};

export function createConnectHandler(deps: { verifier: JwtVerifier }): ConnectHandler {
  return {
    async handle(raw: unknown): Promise<ConnectHandlerResult> {
      const parsed = safeParseClientToRuntimeEvent(raw);
      if (!parsed.success || parsed.data.type !== "connect") {
        return { response: invalidConnect, closeSocket: true };
      }

      try {
        await deps.verifier.verify(parsed.data.auth_token);
      } catch (error) {
        return {
          response: mapJwtVerificationErrorToRuntimeError(toJwtVerificationFailure(error)),
          closeSocket: true,
        };
      }

      return {
        response: {
          type: "hello_ok",
          // TODO(#29): Replace the intentionally empty projection with Conversation History.
          session_snapshot: { messages: [], before_cursor: null },
        },
        closeSocket: false,
      };
    },
  };
}

function toJwtVerificationFailure(error: unknown): JwtVerificationFailure {
  if (hasJwtVerificationReason(error)) {
    return { reason: error.reason };
  }

  return { reason: "jwks_unavailable" };
}

function hasJwtVerificationReason(error: unknown): error is JwtVerificationFailure {
  if (typeof error !== "object" || error === null || !("reason" in error)) {
    return false;
  }

  return (
    error.reason === "expired" ||
    error.reason === "invalid_signature" ||
    error.reason === "wrong_issuer" ||
    error.reason === "wrong_audience" ||
    error.reason === "unknown_key" ||
    error.reason === "jwks_unavailable" ||
    error.reason === "malformed"
  );
}
