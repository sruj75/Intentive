/**
 * Agent Instance registry.
 *
 * Non-durable by design for the connection-control slice. #28/#29 replace this
 * implementation with a Neon-backed repo once instances and history have state
 * worth surviving process restarts.
 */
import { randomUUID } from "node:crypto";

import type { AgentInstance } from "../types/instance.js";

export interface AgentInstanceRegistry {
  loadOrCreate(userId: string): Promise<AgentInstance>;
}

export function createInMemoryAgentInstanceRegistry(
  options: { newId?: () => string } = {},
): AgentInstanceRegistry {
  const newId = options.newId ?? randomUUID;
  const byUserId = new Map<string, AgentInstance>();

  return {
    async loadOrCreate(userId: string): Promise<AgentInstance> {
      const existing = byUserId.get(userId);
      if (existing) {
        return existing;
      }

      const instance = Object.freeze({ id: newId(), userId });
      byUserId.set(userId, instance);
      return instance;
    },
  };
}
