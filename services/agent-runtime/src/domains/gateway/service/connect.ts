import {
  type ClientKind,
  safeParseClientToRuntimeEvent,
  type RuntimeError,
  type RuntimeToClientEvent,
} from "@intentive/protocol";
import { asJwtVerificationFailure, type JwtVerifier } from "@intentive/providers/auth";

import type { SessionSnapshotReader } from "../../conversation/types/conversation.js";
import type { BoundSession } from "../../sessions/types/event.js";
import { mapJwtVerificationErrorToRuntimeError } from "./auth-failure.js";
import { conversationHistoryUnavailableError } from "./history-unavailable.js";

export interface GatewaySessionRegistry {
  loadSessionByAuthSubject(input: {
    readonly authSubject: string;
    readonly clientKind: ClientKind;
  }): Promise<BoundSession | null>;
}

export interface ConnectHandlerResult {
  readonly response: RuntimeToClientEvent;
  readonly closeSocket: boolean;
  readonly session?: BoundSession;
}

export interface ConnectHandler {
  handle(raw: unknown): Promise<ConnectHandlerResult>;
}

const invalidConnect: RuntimeError = {
  type: "runtime_error",
  code: "invalid_connect",
  message: "First WebSocket event must be connect.",
};

export function createConnectHandler(deps: {
  verifier: JwtVerifier;
  sessions: GatewaySessionRegistry;
  conversation: SessionSnapshotReader;
}): ConnectHandler {
  return {
    async handle(raw: unknown): Promise<ConnectHandlerResult> {
      const parsed = safeParseClientToRuntimeEvent(raw);
      if (!parsed.success || parsed.data.type !== "connect") {
        return { response: invalidConnect, closeSocket: true };
      }

      let session: BoundSession | null;
      try {
        const principal = await deps.verifier.verify(parsed.data.auth_token);
        session = await deps.sessions.loadSessionByAuthSubject({
          authSubject: principal.user_id,
          clientKind: parsed.data.client_kind,
        });
      } catch (error) {
        return {
          response: mapJwtVerificationErrorToRuntimeError(asJwtVerificationFailure(error)),
          closeSocket: true,
        };
      }

      if (!session) {
        return {
          response: {
            type: "runtime_error",
            code: "service_unavailable",
            message: "Session has not been started.",
          },
          closeSocket: true,
        };
      }

      try {
        return {
          response: {
            type: "hello_ok",
            session_snapshot: await deps.conversation.readSnapshot(session.userId),
          },
          closeSocket: false,
          session,
        };
      } catch {
        return {
          response: conversationHistoryUnavailableError(),
          closeSocket: true,
        };
      }
    },
  };
}
