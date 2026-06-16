import type { ClientKind, RuntimeToClientEvent } from "@intentive/protocol";
import type { WebSocket } from "ws";

import type {
  ConnectionHandle,
  ConnectionRegistry,
  RegisteredConnection,
} from "../../delivery/types/delivery.js";
import type { BoundSession } from "../../sessions/types/event.js";

interface StoredConnection extends RegisteredConnection {
  readonly socket: Pick<WebSocket, "send">;
}

export function createConnectionRegistry(): ConnectionRegistry & {
  register(session: BoundSession, socket: Pick<WebSocket, "send">): ConnectionHandle;
} {
  const byUser = new Map<string, Set<StoredConnection>>();

  return {
    register(session, socket) {
      const connection: StoredConnection = {
        socket,
        clientKind: session.clientKind === "system" ? "mobile" : session.clientKind,
        foreground: true,
      };
      const connections = byUser.get(session.userId) ?? new Set<StoredConnection>();
      connections.add(connection);
      byUser.set(session.userId, connections);

      return {
        setForeground(foreground) {
          connection.foreground = foreground;
        },
        unregister() {
          connections.delete(connection);
          if (connections.size === 0) {
            byUser.delete(session.userId);
          }
        },
      };
    },

    send(userId, predicate, event: RuntimeToClientEvent) {
      const connections = byUser.get(userId);
      if (!connections) {
        return [];
      }

      const delivered: ClientKind[] = [];
      for (const connection of connections) {
        if (!predicate(connection)) {
          continue;
        }
        try {
          connection.socket.send(JSON.stringify(event));
          delivered.push(connection.clientKind);
        } catch {
          connections.delete(connection);
        }
      }
      if (connections.size === 0) {
        byUser.delete(userId);
      }
      return delivered;
    },
  };
}
