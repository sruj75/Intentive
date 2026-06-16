import type { ClientKind, RuntimeToClientEvent } from "@intentive/protocol";
import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";
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

export function createConnectionRegistry(
  params: { readonly logger?: Logger } = {},
): ConnectionRegistry & {
  register(session: BoundSession, socket: Pick<WebSocket, "send">): ConnectionHandle;
} {
  const byUser = new Map<string, Set<StoredConnection>>();
  const logger = params.logger ?? createNoopLogger();

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
      logger.info("gateway.clients", {
        user_id: session.userId,
        client_kind: connection.clientKind,
        connected_clients: countConnections(byUser),
      });

      return {
        setForeground(foreground) {
          connection.foreground = foreground;
        },
        unregister() {
          connections.delete(connection);
          if (connections.size === 0) {
            byUser.delete(session.userId);
          }
          logger.info("gateway.clients", {
            user_id: session.userId,
            client_kind: connection.clientKind,
            connected_clients: countConnections(byUser),
          });
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

function countConnections(byUser: Map<string, Set<StoredConnection>>): number {
  let count = 0;
  for (const connections of byUser.values()) {
    count += connections.size;
  }
  return count;
}
