import {
  safeParseClientToRuntimeEvent,
  type ClientToRuntimeEvent,
  type RuntimeToClientEvent,
} from "@intentive/protocol";
import type { RawData, WebSocket } from "ws";

import type { ConnectionHandle } from "../../delivery/types/delivery.js";
import type { BoundSession } from "../../sessions/types/event.js";
import type { ConnectHandler } from "../service/connect.js";

export type PostConnectEvent = Exclude<ClientToRuntimeEvent, { type: "connect" }>;

/**
 * Handles one post-connect inbound event. May return a single
 * runtime→client event to send straight back (e.g. a History Backfill response);
 * returning nothing means the event was handled without a direct reply.
 */
export type GatewayEventHandler = (
  session: BoundSession,
  event: PostConnectEvent,
  connection: ConnectionHandle | null,
) => Promise<RuntimeToClientEvent | void> | RuntimeToClientEvent | void;

export type GatewayConnectionRegistrar = (
  session: BoundSession,
  socket: WebSocket,
) => ConnectionHandle;

export function attachGatewayWebSocketHandler(
  socket: WebSocket,
  handler: ConnectHandler,
  onEvent: GatewayEventHandler = () => undefined,
  registerConnection?: GatewayConnectionRegistrar,
): void {
  let connected = false;
  let session: BoundSession | undefined;
  let connection: ConnectionHandle | null = null;

  socket.on("close", () => {
    connection?.unregister();
    connection = null;
  });

  socket.on("message", (data) => {
    void handleMessage(socket, handler, onEvent, data, {
      isConnected: () => connected,
      getSession: () => session,
      markConnected: () => {
        connected = true;
      },
      bindSession: (next) => {
        session = next;
        connection = registerConnection?.(next, socket) ?? null;
      },
      getConnection: () => connection,
    }).catch(() => {
      sendRuntimeError(socket, {
        code: "service_unavailable",
        message: "WebSocket event could not be processed.",
      });
      socket.close();
    });
  });
}

async function handleMessage(
  socket: WebSocket,
  handler: ConnectHandler,
  onEvent: GatewayEventHandler,
  data: RawData,
  state: {
    isConnected(): boolean;
    getSession(): BoundSession | undefined;
    markConnected(): void;
    bindSession(session: BoundSession): void;
    getConnection(): ConnectionHandle | null;
  },
): Promise<void> {
  const raw = parseFrame(data);
  if (state.isConnected()) {
    const session = state.getSession();
    if (!session) {
      socket.close();
      return;
    }
    await handlePostConnectMessage(socket, session, onEvent, raw, state.getConnection());
    return;
  }

  const result = await handler.handle(raw);
  socket.send(JSON.stringify(result.response));
  if (result.response.type === "hello_ok" && result.session) {
    state.bindSession(result.session);
    state.markConnected();
  }
  if (result.closeSocket) {
    socket.close();
  }
}

async function handlePostConnectMessage(
  socket: WebSocket,
  session: BoundSession,
  onEvent: GatewayEventHandler,
  raw: unknown,
  connection: ConnectionHandle | null,
): Promise<void> {
  const parsed = safeParseClientToRuntimeEvent(raw);
  if (!parsed.success || parsed.data.type === "connect") {
    socket.send(
      JSON.stringify({
        type: "runtime_error",
        code: "invalid_connect",
        message: "WebSocket event is invalid for this connection state.",
      }),
    );
    return;
  }

  const response = await onEvent(session, parsed.data, connection);
  if (response) {
    socket.send(JSON.stringify(response));
  }
}

function parseFrame(data: RawData): unknown {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}

function sendRuntimeError(
  socket: WebSocket,
  error: { code: "service_unavailable"; message: string },
): void {
  socket.send(
    JSON.stringify({
      type: "runtime_error",
      code: error.code,
      message: error.message,
    }),
  );
}
