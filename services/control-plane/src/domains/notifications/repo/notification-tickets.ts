import type { Sql } from "../../../db/sql.js";

export interface NotificationTicketRecordInput {
  ticketId: string;
  deviceId: string;
  expoPushToken: string;
  messageId: string;
}

export interface UncheckedNotificationTicket {
  id: string;
  ticketId: string;
  deviceId: string;
  expoPushToken: string;
}

export interface NotificationTicketsRepo {
  recordTickets(rows: NotificationTicketRecordInput[]): Promise<void>;
  listUnchecked(limit?: number): Promise<UncheckedNotificationTicket[]>;
  markChecked(ids: string[]): Promise<void>;
}

export function createNotificationTicketsRepo(sql: Sql): NotificationTicketsRepo {
  return {
    async recordTickets(rows) {
      for (const row of rows) {
        await sql`
          INSERT INTO control_plane.notification_tickets
            (ticket_id, device_id, expo_push_token, message_id)
          VALUES (${row.ticketId}, ${row.deviceId}, ${row.expoPushToken}, ${row.messageId})
        `;
      }
    },

    async listUnchecked(limit = 100) {
      return sql<UncheckedNotificationTicket>`
        SELECT
          id,
          ticket_id       AS "ticketId",
          device_id       AS "deviceId",
          expo_push_token AS "expoPushToken"
        FROM control_plane.notification_tickets
        WHERE checked_at IS NULL
        ORDER BY created_at
        LIMIT ${limit}
      `;
    },

    async markChecked(ids) {
      for (const id of ids) {
        await sql`
          UPDATE control_plane.notification_tickets
          SET checked_at = now()
          WHERE id = ${id}
        `;
      }
    },
  };
}
