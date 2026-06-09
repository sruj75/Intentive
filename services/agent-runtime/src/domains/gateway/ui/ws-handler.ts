import { safeParseClientToRuntimeEvent, type ClientToRuntimeEvent } from "@intentive/protocol";
import type { RawData, WebSocket } from "ws";

import type { ConnectHandler, GatewaySession } from "../service/connect.js";

type PostConnectEvent = Exclude<ClientToRuntimeEvent, { type: "connect" }>;

export type GatewayEventHandler = (
  session: GatewaySession,
  event: PostConnectEvent,
) => Promise<void> | void;

export function attachGatewayWebSocketHandler(
  socket: WebSocket,
  handler: ConnectHandler,
  onEvent: GatewayEventHandler = () => undefined,
): void {
  let connected = false;
  let session: GatewaySession | undefined;

  socket.on("message", (data) => {
    void handleMessage(socket, handler, onEvent, data, {
      isConnected: () => connected,
      getSession: () => session,
      markConnected: () => {
        connected = true;
      },
      bindSession: (next) => {
        session = next;
      },
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
    getSession(): GatewaySession | undefined;
    markConnected(): void;
    bindSession(session: GatewaySession): void;
  },
): Promise<void> {
  const raw = parseFrame(data);
  if (state.isConnected()) {
    const session = state.getSession();
    if (!session) {
      socket.close();
      return;
    }
    await handlePostConnectMessage(socket, session, onEvent, raw);
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
  session: GatewaySession,
  onEvent: GatewayEventHandler,
  raw: unknown,
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
    socket.close();
    return;
  }

  await onEvent(session, parsed.data);
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
