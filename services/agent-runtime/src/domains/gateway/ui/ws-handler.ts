import { safeParseClientToRuntimeEvent, type ClientToRuntimeEvent } from "@intentive/protocol";
import type { RawData, WebSocket } from "ws";

import type { ConnectHandler } from "../service/connect.js";

type PostConnectEvent = Exclude<ClientToRuntimeEvent, { type: "connect" }>;

export type GatewayEventHandler = (event: PostConnectEvent) => Promise<void> | void;

export function attachGatewayWebSocketHandler(
  socket: WebSocket,
  handler: ConnectHandler,
  onEvent: GatewayEventHandler = () => undefined,
): void {
  let connected = false;

  socket.on("message", (data) => {
    void handleMessage(socket, handler, onEvent, data, {
      isConnected: () => connected,
      markConnected: () => {
        connected = true;
      },
    });
  });
}

async function handleMessage(
  socket: WebSocket,
  handler: ConnectHandler,
  onEvent: GatewayEventHandler,
  data: RawData,
  state: { isConnected(): boolean; markConnected(): void },
): Promise<void> {
  const raw = parseFrame(data);
  if (state.isConnected()) {
    await handlePostConnectMessage(socket, onEvent, raw);
    return;
  }

  const result = await handler.handle(raw);
  socket.send(JSON.stringify(result.response));
  if (result.response.type === "hello_ok") {
    state.markConnected();
  }
  if (result.closeSocket) {
    socket.close();
  }
}

async function handlePostConnectMessage(
  socket: WebSocket,
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

  await onEvent(parsed.data);
}

function parseFrame(data: RawData): unknown {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}
