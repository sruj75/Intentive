import type { ClientKind, RuntimeToClientEvent } from "@intentive/protocol";
import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";
import type { WebSocket } from "ws";

import type {
  CoachingPresencePreflight,
  ConnectionHandle,
  ConnectionRegistry,
  RegisteredConnection,
} from "../../delivery/types/delivery.js";
import type { BoundSession } from "../../sessions/types/event.js";

interface StoredConnection extends RegisteredConnection {
  readonly socket: Pick<WebSocket, "send">;
}

interface CoachingPresenceHighWater {
  readonly changedAt: number;
  readonly terminal: boolean;
}

export function createConnectionRegistry(
  params: { readonly logger?: Logger } = {},
): ConnectionRegistry & {
  register(session: BoundSession, socket: Pick<WebSocket, "send">): ConnectionHandle;
} {
  const byUser = new Map<string, Set<StoredConnection>>();
  const coachingPresenceHighWater = new Map<string, Map<string, CoachingPresenceHighWater>>();
  const coachingArrivalGeneration = new Map<string, Map<string, number>>();
  const logger = params.logger ?? createNoopLogger();

  return {
    register(session, socket) {
      const connection: StoredConnection = {
        socket,
        clientKind: session.clientKind === "system" ? "mobile" : session.clientKind,
        capabilities: session.capabilities ?? [],
        foreground: true,
        coachingWindowId: null,
        coachingPresence: null,
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
        prepareActiveCoachingPresence(windowId, changedAt) {
          return prepareActiveCoachingPresence(
            coachingPresenceHighWater,
            coachingArrivalGeneration,
            session.userId,
            windowId,
            changedAt,
          );
        },
        setCoachingPresence(windowId, state, changedAt, preflight) {
          if (state === "locked") {
            return applyCoachingWindowLock(
              coachingPresenceHighWater,
              coachingArrivalGeneration,
              byUser,
              session.userId,
              windowId,
              changedAt,
            );
          }
          const activePreflight =
            preflight ??
            prepareActiveCoachingPresence(
              coachingPresenceHighWater,
              coachingArrivalGeneration,
              session.userId,
              windowId,
              changedAt,
            );
          if (
            !activePreflight ||
            !isCurrentCoachingPreflight(
              coachingArrivalGeneration,
              session.userId,
              windowId,
              changedAt,
              activePreflight,
            ) ||
            !acceptActiveCoachingPresence(
              coachingPresenceHighWater,
              session.userId,
              windowId,
              changedAt,
            )
          ) {
            return false;
          }
          connection.coachingWindowId = windowId;
          connection.coachingPresence = state;
          return true;
        },
        clearCoachingPresence(windowId, endedAt) {
          advanceCoachingArrivalGeneration(coachingArrivalGeneration, session.userId, windowId);
          if (connection.coachingWindowId === windowId) {
            connection.coachingWindowId = null;
            connection.coachingPresence = null;
          }
          markCoachingWindowTerminal(coachingPresenceHighWater, session.userId, windowId, endedAt);
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

      const frame = JSON.stringify(event);
      const delivered: ClientKind[] = [];
      for (const connection of connections) {
        if (!predicate(connection)) {
          continue;
        }
        try {
          connection.socket.send(frame);
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

    sendFirstSuccessful(userId, predicate, event) {
      const connections = byUser.get(userId);
      if (!connections) {
        return null;
      }

      const frame = JSON.stringify(event);
      for (const connection of connections) {
        if (!predicate(connection)) {
          continue;
        }
        try {
          connection.socket.send(frame);
          return connection.clientKind;
        } catch {
          connections.delete(connection);
        }
      }
      if (connections.size === 0) {
        byUser.delete(userId);
      }
      return null;
    },

    hasActiveCoachingWindow(userId, windowId) {
      const connections = byUser.get(userId);
      if (!connections) {
        return false;
      }
      return [...connections].some(
        (connection) =>
          connection.clientKind === "desktop" &&
          connection.capabilities.includes("desktop_coaching_v1") &&
          connection.coachingWindowId === windowId &&
          connection.coachingPresence === "active",
      );
    },

    lockCoachingWindow(userId, windowId, changedAt) {
      return applyCoachingWindowLock(
        coachingPresenceHighWater,
        coachingArrivalGeneration,
        byUser,
        userId,
        windowId,
        changedAt,
      );
    },

    clearCoachingWindow(userId, windowId, endedAt) {
      advanceCoachingArrivalGeneration(coachingArrivalGeneration, userId, windowId);
      const connections = byUser.get(userId);
      if (connections) {
        for (const connection of connections) {
          if (connection.coachingWindowId === windowId) {
            connection.coachingWindowId = null;
            connection.coachingPresence = null;
          }
        }
      }
      markCoachingWindowTerminal(coachingPresenceHighWater, userId, windowId, endedAt);
    },
  };
}

function applyCoachingWindowLock(
  highWaterByUser: Map<string, Map<string, CoachingPresenceHighWater>>,
  generationByUser: Map<string, Map<string, number>>,
  byUser: Map<string, Set<StoredConnection>>,
  userId: string,
  windowId: string,
  changedAt: string,
): boolean {
  advanceCoachingArrivalGeneration(generationByUser, userId, windowId);
  retainLatestCoachingTimestamp(highWaterByUser, userId, windowId, changedAt);
  const connections = byUser.get(userId);
  if (connections) {
    lockCoachingConnections(connections, windowId);
  }
  return true;
}

function prepareActiveCoachingPresence(
  highWaterByUser: Map<string, Map<string, CoachingPresenceHighWater>>,
  generationByUser: Map<string, Map<string, number>>,
  userId: string,
  windowId: string,
  changedAt: string,
): CoachingPresencePreflight | null {
  if (!canAcceptActiveCoachingPresence(highWaterByUser, userId, windowId, changedAt)) {
    return null;
  }
  return {
    windowId,
    changedAt,
    generation: advanceCoachingArrivalGeneration(generationByUser, userId, windowId),
  };
}

function isCurrentCoachingPreflight(
  generationByUser: Map<string, Map<string, number>>,
  userId: string,
  windowId: string,
  changedAt: string,
  preflight: CoachingPresencePreflight,
): boolean {
  return (
    preflight.windowId === windowId &&
    preflight.changedAt === changedAt &&
    generationByUser.get(userId)?.get(windowId) === preflight.generation
  );
}

function advanceCoachingArrivalGeneration(
  generationByUser: Map<string, Map<string, number>>,
  userId: string,
  windowId: string,
): number {
  const byWindow = generationByUser.get(userId) ?? new Map<string, number>();
  const generation = (byWindow.get(windowId) ?? 0) + 1;
  byWindow.set(windowId, generation);
  generationByUser.set(userId, byWindow);
  return generation;
}

function acceptActiveCoachingPresence(
  highWaterByUser: Map<string, Map<string, CoachingPresenceHighWater>>,
  userId: string,
  windowId: string,
  changedAt: string,
): boolean {
  if (!canAcceptActiveCoachingPresence(highWaterByUser, userId, windowId, changedAt)) {
    return false;
  }
  const incoming = Date.parse(changedAt);
  const byWindow = highWaterByUser.get(userId) ?? new Map<string, CoachingPresenceHighWater>();
  byWindow.set(windowId, { changedAt: incoming, terminal: false });
  highWaterByUser.set(userId, byWindow);
  return true;
}

function canAcceptActiveCoachingPresence(
  highWaterByUser: Map<string, Map<string, CoachingPresenceHighWater>>,
  userId: string,
  windowId: string,
  changedAt: string,
): boolean {
  const incoming = Date.parse(changedAt);
  if (!Number.isFinite(incoming)) {
    return false;
  }
  const latest = highWaterByUser.get(userId)?.get(windowId);
  return !latest?.terminal && (latest === undefined || incoming > latest.changedAt);
}

function retainLatestCoachingTimestamp(
  highWaterByUser: Map<string, Map<string, CoachingPresenceHighWater>>,
  userId: string,
  windowId: string,
  changedAt: string,
): void {
  const byWindow = highWaterByUser.get(userId) ?? new Map<string, CoachingPresenceHighWater>();
  const current = byWindow.get(windowId);
  const incoming = Date.parse(changedAt);
  if (Number.isFinite(incoming) && (current === undefined || incoming > current.changedAt)) {
    byWindow.set(windowId, {
      changedAt: incoming,
      terminal: current?.terminal ?? false,
    });
    highWaterByUser.set(userId, byWindow);
  }
}

function markCoachingWindowTerminal(
  highWaterByUser: Map<string, Map<string, CoachingPresenceHighWater>>,
  userId: string,
  windowId: string,
  endedAt: string,
): void {
  const byWindow = highWaterByUser.get(userId) ?? new Map<string, CoachingPresenceHighWater>();
  const current = byWindow.get(windowId);
  const endedAtMs = Date.parse(endedAt);
  byWindow.set(windowId, {
    changedAt: Number.isFinite(endedAtMs)
      ? Math.max(current?.changedAt ?? Number.NEGATIVE_INFINITY, endedAtMs)
      : (current?.changedAt ?? Number.POSITIVE_INFINITY),
    terminal: true,
  });
  highWaterByUser.set(userId, byWindow);
}

function lockCoachingConnections(connections: Set<StoredConnection>, windowId: string): void {
  for (const connection of connections) {
    if (connection.coachingWindowId === windowId) {
      connection.coachingPresence = "locked";
    }
  }
}

function countConnections(byUser: Map<string, Set<StoredConnection>>): number {
  let count = 0;
  for (const connections of byUser.values()) {
    count += connections.size;
  }
  return count;
}
