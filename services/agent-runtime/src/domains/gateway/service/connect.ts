import {
  type ClientKind,
  safeParseClientToRuntimeEvent,
  type RuntimeError,
  type RuntimeToClientEvent,
} from "@intentive/protocol";
import { asJwtVerificationFailure, type JwtVerifier } from "@intentive/providers/auth";

import type { SessionSnapshotReader } from "../../conversation/types/conversation.js";
import type { BoundSession } from "../../sessions/types/event.js";
import type { ProcedureFloorResolver } from "../../bundles/types/floor.js";
import { mapJwtVerificationErrorToRuntimeError } from "./auth-failure.js";
import { conversationHistoryUnavailableError } from "./history-unavailable.js";

export interface GatewaySessionRegistry {
  loadSessionByAuthSubject(input: {
    readonly authSubject: string;
    readonly clientKind: ClientKind;
    readonly clientTz?: string;
  }): Promise<Omit<BoundSession, "pinnedFloor"> | null>;
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
  floorResolver: ProcedureFloorResolver;
}): ConnectHandler {
  return {
    async handle(raw: unknown): Promise<ConnectHandlerResult> {
      const parsed = safeParseClientToRuntimeEvent(raw);
      if (!parsed.success || parsed.data.type !== "connect") {
        return { response: invalidConnect, closeSocket: true };
      }

      let session: Omit<BoundSession, "pinnedFloor"> | null;
      try {
        const principal = await deps.verifier.verify(parsed.data.auth_token);
        session = await deps.sessions.loadSessionByAuthSubject({
          authSubject: principal.user_id,
          clientKind: parsed.data.client_kind,
          clientTz: parsed.data.client_tz,
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
        const pinnedFloor = await deps.floorResolver.resolve("production");
        const boundSession: BoundSession = { ...session, pinnedFloor };
        return {
          response: {
            type: "hello_ok",
            session_snapshot: await deps.conversation.readSnapshot(boundSession.userId),
          },
          closeSocket: false,
          session: boundSession,
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
