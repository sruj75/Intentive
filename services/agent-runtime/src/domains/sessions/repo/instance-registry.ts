import { randomUUID } from "node:crypto";

import type { AgentInstance } from "../types/instance.js";
import type { Sql } from "./sql.js";

export interface AgentInstanceRegistry {
  loadOrCreate(input: {
    userId: string;
    authSubject: string;
    clientTz?: string | null;
  }): Promise<AgentInstance>;
  loadByAuthSubject(authSubject: string): Promise<AgentInstance | null>;
  loadByUserId(userId: string): Promise<AgentInstance | null>;
  loadUserTz(userId: string): Promise<string | null>;
  recordClientTzByAuthSubject(authSubject: string, clientTz?: string): Promise<void>;
}

export function createInMemoryAgentInstanceRegistry(
  options: { newId?: () => string } = {},
): AgentInstanceRegistry {
  const newId = options.newId ?? randomUUID;
  const byUserId = new Map<string, AgentInstance>();
  const userIdByAuthSubject = new Map<string, string>();
  const authSubjectByUserId = new Map<string, string>();

  return {
    async loadOrCreate({ userId, authSubject, clientTz }): Promise<AgentInstance> {
      const existing = byUserId.get(userId);
      if (existing) {
        const previousAuthSubject = authSubjectByUserId.get(userId);
        if (previousAuthSubject) {
          userIdByAuthSubject.delete(previousAuthSubject);
        }
        userIdByAuthSubject.set(authSubject, userId);
        authSubjectByUserId.set(userId, authSubject);
        if (clientTz) {
          const updated = Object.freeze({ ...existing, clientTz });
          byUserId.set(userId, updated);
          return updated;
        }
        return existing;
      }

      const instance = Object.freeze({ id: newId(), userId, clientTz: clientTz ?? null });
      byUserId.set(userId, instance);
      userIdByAuthSubject.set(authSubject, userId);
      authSubjectByUserId.set(userId, authSubject);
      return instance;
    },

    async loadByAuthSubject(authSubject) {
      const userId = userIdByAuthSubject.get(authSubject);
      return userId ? (byUserId.get(userId) ?? null) : null;
    },

    async loadByUserId(userId) {
      return byUserId.get(userId) ?? null;
    },

    async loadUserTz(userId) {
      return byUserId.get(userId)?.clientTz ?? null;
    },

    async recordClientTzByAuthSubject(authSubject, clientTz) {
      if (!clientTz) {
        return;
      }
      const userId = userIdByAuthSubject.get(authSubject);
      if (!userId) {
        return;
      }
      const existing = byUserId.get(userId);
      if (existing) {
        byUserId.set(userId, Object.freeze({ ...existing, clientTz }));
      }
    },
  };
}

export function createAgentInstanceRepo(sql: Sql): AgentInstanceRegistry {
  return {
    async loadOrCreate({ userId, authSubject, clientTz }): Promise<AgentInstance> {
      const rows = await sql<{ id: string; user_id: string; client_tz: string | null }>`
        INSERT INTO agent_runtime.agent_instances (user_id, auth_subject, client_tz)
        VALUES (${userId}, ${authSubject}, ${clientTz ?? null})
        ON CONFLICT (user_id) DO UPDATE SET
          auth_subject = EXCLUDED.auth_subject,
          client_tz = COALESCE(${clientTz ?? null}, agent_runtime.agent_instances.client_tz)
        RETURNING id, user_id, client_tz
      `;
      const row = rows[0];
      if (!row) {
        throw new Error("loadOrCreate: upsert returned no row");
      }

      return Object.freeze({ id: row.id, userId: row.user_id, clientTz: row.client_tz });
    },

    async loadByAuthSubject(authSubject) {
      const rows = await sql<{ id: string; user_id: string; client_tz: string | null }>`
        SELECT id, user_id, client_tz
        FROM agent_runtime.agent_instances
        WHERE auth_subject = ${authSubject}
      `;
      const row = rows[0];
      return row
        ? Object.freeze({ id: row.id, userId: row.user_id, clientTz: row.client_tz })
        : null;
    },

    async loadByUserId(userId) {
      const rows = await sql<{ id: string; user_id: string; client_tz: string | null }>`
        SELECT id, user_id, client_tz
        FROM agent_runtime.agent_instances
        WHERE user_id = ${userId}
      `;
      const row = rows[0];
      return row
        ? Object.freeze({ id: row.id, userId: row.user_id, clientTz: row.client_tz })
        : null;
    },

    async loadUserTz(userId) {
      const rows = await sql<{ client_tz: string | null }>`
        SELECT client_tz
        FROM agent_runtime.agent_instances
        WHERE user_id = ${userId}
      `;
      return rows[0]?.client_tz ?? null;
    },

    async recordClientTzByAuthSubject(authSubject, clientTz) {
      if (!clientTz) {
        return;
      }
      await sql`
        UPDATE agent_runtime.agent_instances
        SET client_tz = ${clientTz}
        WHERE auth_subject = ${authSubject}
      `;
    },
  };
}
