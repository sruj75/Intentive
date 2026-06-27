import {
  type ClientKind,
  safeParseClientToRuntimeEvent,
  type RuntimeError,
  type RuntimeToClientEvent,
} from "@intentive/protocol";
import { asJwtVerificationFailure, type JwtVerifier } from "@intentive/providers/auth";
import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

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
  logger?: Logger;
}): ConnectHandler {
  const logger = deps.logger ?? createNoopLogger();
  return {
    async handle(raw: unknown): Promise<ConnectHandlerResult> {
      const parsed = safeParseClientToRuntimeEvent(raw);
      if (!parsed.success || parsed.data.type !== "connect") {
        logger.warn("gateway.connect", { status: "reject" });
        return { response: invalidConnect, closeSocket: true };
      }

      let authSubject: string;
      try {
        const principal = await deps.verifier.verify(parsed.data.auth_token);
        authSubject = principal.user_id;
      } catch (error) {
        logger.warn("gateway.connect", {
          status: "reject",
          client_kind: parsed.data.client_kind,
          error_type: error instanceof Error ? error.name : typeof error,
        });
        return {
          response: mapJwtVerificationErrorToRuntimeError(asJwtVerificationFailure(error)),
          closeSocket: true,
        };
      }

      let session: Omit<BoundSession, "pinnedFloor"> | null;
      try {
        session = await deps.sessions.loadSessionByAuthSubject({
          authSubject,
          clientKind: parsed.data.client_kind,
          clientTz: parsed.data.client_tz,
        });
      } catch (error) {
        logger.warn("gateway.connect", {
          status: "reject",
          client_kind: parsed.data.client_kind,
          error_type: error instanceof Error ? error.name : typeof error,
        });
        return {
          response: {
            type: "runtime_error",
            code: "service_unavailable",
            message: "Session is temporarily unavailable.",
          },
          closeSocket: true,
        };
      }

      if (!session) {
        logger.warn("gateway.connect", {
          status: "reject",
          client_kind: parsed.data.client_kind,
        });
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
        logger.info("gateway.connect", {
          status: "accept",
          user_id: boundSession.userId,
          client_kind: boundSession.clientKind,
          bundle_version: boundSession.pinnedFloor.version,
        });
        return {
          response: {
            type: "hello_ok",
            session_snapshot: await deps.conversation.readSnapshot(boundSession.userId),
          },
          closeSocket: false,
          session: boundSession,
        };
      } catch (error) {
        logger.error("gateway.connect", error, {
          status: "reject",
          user_id: session.userId,
          client_kind: session.clientKind,
        });
        return {
          response: conversationHistoryUnavailableError(),
          closeSocket: true,
        };
      }
    },
  };
}
