import type { DeliveriesRepo, DeliveryRecord } from "../types/delivery.js";
import type { Sql } from "./sql.js";

export function createDeliveriesRepo(sql: Sql): DeliveriesRepo {
  return {
    recordQuery(record: DeliveryRecord) {
      return sql<{ id: string }>`
        INSERT INTO agent_runtime.deliveries
          (user_id, message_id, path, client_kind, status, error, attempted_at)
        VALUES (
          ${record.userId},
          ${record.messageId},
          ${record.path},
          ${record.clientKind},
          ${record.status},
          ${record.error},
          ${record.attemptedAt}
        )
        RETURNING id
      `;
    },
  };
}
