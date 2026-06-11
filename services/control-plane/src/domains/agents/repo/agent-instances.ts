/**
 * Agent Instances repo — the only place that knows the
 * `control_plane.agent_instances` SQL.
 *
 * A deep module behind a two-method interface: record that a User has
 * provisioned a Companion (returning nothing — the caller already holds the
 * Runtime's identity), or ask whether a User has ever provisioned one. The table
 * shape, the PK-on-`user_id` idempotency, and the upsert are all hidden in here.
 * Mirrors `users.ts`/`devices.ts`.
 *
 * It stores **no `ws_url`**: the Agent Runtime owns its own address, so Routing
 * re-derives it from a live Session Start each request rather than caching a
 * value that can go stale (see service/agents-service.ts and
 * migrations/0004_agent_instances.sql).
 */
import type { Sql } from "../../../db/sql.js";

export interface AgentInstancesRepo {
  /**
   * Record that `userId` has provisioned `agentInstanceId`. Idempotent on
   * `user_id` (enforced by the PRIMARY KEY, not application logic): the same User
   * always resolves to the one row, and a repeat refreshes it in place. The
   * Agent Runtime owns instance identity, so a later call may carry a new id;
   * the upsert keeps the latest.
   */
  recordInstance(input: { userId: string; agentInstanceId: string }): Promise<void>;

  /**
   * Whether `userId` has ever provisioned a Companion. The cheap local read the
   * `/me` composer uses for `has_agent_instance` — no Runtime round trip.
   */
  hasInstance(userId: string): Promise<boolean>;
}

export function createAgentInstancesRepo(sql: Sql): AgentInstancesRepo {
  return {
    async recordInstance({ userId, agentInstanceId }) {
      // ON CONFLICT (user_id) DO UPDATE so a re-record touches the existing row
      // (the PK makes one-row-per-user a DB invariant) and keeps the latest
      // instance id and freshness in a single round trip.
      await sql`
        INSERT INTO control_plane.agent_instances (user_id, agent_instance_id)
        VALUES (${userId}, ${agentInstanceId})
        ON CONFLICT (user_id) DO UPDATE SET
          agent_instance_id = EXCLUDED.agent_instance_id,
          updated_at        = now()
      `;
    },

    async hasInstance(userId) {
      const rows = await sql<{ exists: boolean }>`
        SELECT EXISTS (
          SELECT 1 FROM control_plane.agent_instances WHERE user_id = ${userId}
        ) AS exists
      `;
      return rows[0]?.exists ?? false;
    },
  };
}
