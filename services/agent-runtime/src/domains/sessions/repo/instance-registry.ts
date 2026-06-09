import { randomUUID } from "node:crypto";

import type { AgentInstance } from "../types/instance.js";
import type { Sql } from "./sql.js";

export interface AgentInstanceRegistry {
  loadOrCreate(input: { userId: string; authSubject: string }): Promise<AgentInstance>;
  loadByAuthSubject(authSubject: string): Promise<AgentInstance | null>;
}

export function createInMemoryAgentInstanceRegistry(
  options: { newId?: () => string } = {},
): AgentInstanceRegistry {
  const newId = options.newId ?? randomUUID;
  const byUserId = new Map<string, AgentInstance>();
  const userIdByAuthSubject = new Map<string, string>();
  const authSubjectByUserId = new Map<string, string>();

  return {
    async loadOrCreate({ userId, authSubject }): Promise<AgentInstance> {
      const existing = byUserId.get(userId);
      if (existing) {
        const previousAuthSubject = authSubjectByUserId.get(userId);
        if (previousAuthSubject) {
          userIdByAuthSubject.delete(previousAuthSubject);
        }
        userIdByAuthSubject.set(authSubject, userId);
        authSubjectByUserId.set(userId, authSubject);
        return existing;
      }

      const instance = Object.freeze({ id: newId(), userId });
      byUserId.set(userId, instance);
      userIdByAuthSubject.set(authSubject, userId);
      authSubjectByUserId.set(userId, authSubject);
      return instance;
    },

    async loadByAuthSubject(authSubject) {
      const userId = userIdByAuthSubject.get(authSubject);
      return userId ? (byUserId.get(userId) ?? null) : null;
    },
  };
}

export function createAgentInstanceRepo(sql: Sql): AgentInstanceRegistry {
  return {
    async loadOrCreate({ userId, authSubject }): Promise<AgentInstance> {
      const rows = await sql<{ id: string; user_id: string }>`
        INSERT INTO agent_runtime.agent_instances (user_id, auth_subject)
        VALUES (${userId}, ${authSubject})
        ON CONFLICT (user_id) DO UPDATE SET auth_subject = EXCLUDED.auth_subject
        RETURNING id, user_id
      `;
      const row = rows[0];
      if (!row) {
        throw new Error("loadOrCreate: upsert returned no row");
      }

      return Object.freeze({ id: row.id, userId: row.user_id });
    },

    async loadByAuthSubject(authSubject) {
      const rows = await sql<{ id: string; user_id: string }>`
        SELECT id, user_id
        FROM agent_runtime.agent_instances
        WHERE auth_subject = ${authSubject}
      `;
      const row = rows[0];
      return row ? Object.freeze({ id: row.id, userId: row.user_id }) : null;
    },
  };
}
