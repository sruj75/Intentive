import type { LedgerRecord } from "../types/event.js";
import type { Sql, SqlQuery } from "./sql.js";

export interface EventLedger {
  /**
   * Returns the composable insert query for an Agent Runtime event arrival
   * marker. Composition roots can batch this with durable projection writes in
   * one transaction so the marker never commits without its projection.
   */
  recordQuery(record: LedgerRecord): SqlQuery<{ id: string }>;

  /**
   * Append `record` if its per-User idempotency key has not been seen.
   * Duplicate detection is owned by the database unique constraint.
   */
  recordIfNew(record: LedgerRecord): Promise<{ isNew: boolean }>;
}

export function createEventLedger(sql: Sql): EventLedger {
  return {
    recordQuery(record) {
      return sql<{ id: string }>`
        INSERT INTO agent_runtime.runtime_events
          (user_id, kind, dedup_key, payload)
        VALUES (
          ${record.userId},
          ${record.kind},
          ${record.dedupKey},
          ${JSON.stringify(record.payload)}::jsonb
        )
        ON CONFLICT (user_id, kind, dedup_key) DO NOTHING
        RETURNING id
      `;
    },

    async recordIfNew(record) {
      const rows = await this.recordQuery(record);
      return { isNew: rows.length === 1 };
    },
  };
}
