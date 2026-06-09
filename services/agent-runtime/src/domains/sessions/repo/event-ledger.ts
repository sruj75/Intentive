import type { LedgerRecord } from "../types/event.js";
import type { Sql } from "./sql.js";

export interface EventLedger {
  /**
   * Append `record` if its per-User idempotency key has not been seen.
   * Duplicate detection is owned by the database unique constraint.
   */
  recordIfNew(record: LedgerRecord): Promise<{ isNew: boolean }>;
}

export function createEventLedger(sql: Sql): EventLedger {
  return {
    async recordIfNew(record) {
      const rows = await sql<{ id: string }>`
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
      return { isNew: rows.length === 1 };
    },
  };
}
