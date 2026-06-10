import {
  type ClientKind,
  safeParseClientToRuntimeEvent,
  type RuntimeError,
  type RuntimeToClientEvent,
  type SessionSnapshot,
} from "@intentive/protocol";
import { asJwtVerificationFailure, type JwtVerifier } from "@intentive/providers/auth";

import { mapJwtVerificationErrorToRuntimeError } from "./auth-failure.js";
import { conversationHistoryUnavailableError } from "./history-unavailable.js";

export interface GatewaySession {
  readonly userId: string;
  readonly clientKind: ClientKind;
  readonly agentInstanceId: string;
}

export interface GatewaySessionRegistry {
  loadSessionByAuthSubject(input: {
    readonly authSubject: string;
    readonly clientKind: ClientKind;
  }): Promise<GatewaySession | null>;
}

export interface ConnectHandlerResult {
  readonly response: RuntimeToClientEvent;
  readonly closeSocket: boolean;
  readonly session?: GatewaySession;
}

export interface ConnectHandler {
  handle(raw: unknown): Promise<ConnectHandlerResult>;
}

/**
 * Reads a Session Snapshot for a User. The connect handshake calls it with no
 * cursor (the newest window); History Backfill calls it with a cursor for the
 * older page. Injected so the gateway never reaches into the `conversation`
 * domain directly. See ADR-0008 / ADR-0006.
 */
export interface SessionSnapshotReader {
  readSnapshot(userId: string, before?: string, limit?: number): Promise<SessionSnapshot>;
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

      let session: GatewaySession | null;
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
