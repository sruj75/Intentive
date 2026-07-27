import type {
  ClaimedOpening,
  CoachingMonitoringState,
  CoachingWindowsRepo,
} from "../types/coaching.js";
import type { Sql } from "./sql.js";

interface ClaimedOpeningRow {
  readonly user_id: string;
  readonly window_id: string;
  readonly orientation_message_id: string;
}

interface ReadyOpeningRow extends ClaimedOpeningRow {
  readonly body: string;
}

interface MonitoringStateRow {
  readonly user_id: string;
  readonly window_id: string;
  readonly started_at: string | Date;
  readonly orientation_completed_at: string | Date;
  readonly evidence_cursor: string | number | null;
  readonly evidence_version: string | null;
  readonly last_monitoring_turn_at: string | Date | null;
}

export function createCoachingWindowsRepo(sql: Sql): CoachingWindowsRepo {
  return {
    projectLifecycle(userId, event) {
      if (event.type === "coaching_window_started") {
        return [
          sql`
            UPDATE agent_runtime.coaching_windows AS active
            SET
              ended_at = ${event.started_at},
              end_reason = 'superseded'
            FROM agent_runtime.runtime_events AS incoming
            WHERE incoming.user_id = ${userId}
              AND incoming.kind = 'coaching_window_started'
              AND incoming.dedup_key = ${event.window_id}
              AND active.user_id = ${userId}
              AND active.ended_at IS NULL
              AND active.window_id <> ${event.window_id}
              AND active.start_ingest_seq < incoming.ingest_seq
          `,
          sql`
            INSERT INTO agent_runtime.coaching_windows
              (
                user_id,
                window_id,
                started_at,
                start_reason,
                orientation_status,
                orientation_message_id,
                start_ingest_seq
              )
            SELECT
              ${userId},
              ${event.window_id},
              ${event.started_at},
              ${event.reason},
              'pending',
              ${`opening:${event.window_id}`},
              incoming.ingest_seq
            FROM agent_runtime.runtime_events AS incoming
            WHERE incoming.user_id = ${userId}
              AND incoming.kind = 'coaching_window_started'
              AND incoming.dedup_key = ${event.window_id}
              AND NOT EXISTS (
                SELECT 1
                FROM agent_runtime.coaching_windows AS active
                WHERE active.user_id = ${userId}
                  AND active.ended_at IS NULL
              )
            ON CONFLICT (user_id, window_id) DO NOTHING
          `,
        ];
      }

      return [
        sql`
          UPDATE agent_runtime.coaching_windows
          SET
            ended_at = ${event.ended_at},
            end_reason = ${event.reason}
          WHERE user_id = ${userId}
            AND window_id = ${event.window_id}
            AND ended_at IS NULL
        `,
      ];
    },

    async claimOpening(userId, windowId) {
      const ready = await sql<ReadyOpeningRow>`
        SELECT
          coaching_window.user_id,
          coaching_window.window_id,
          coaching_window.orientation_message_id,
          message.body
        FROM agent_runtime.coaching_windows AS coaching_window
        JOIN agent_runtime.conversation_messages AS message
          ON message.user_id = coaching_window.user_id
          AND message.message_id = coaching_window.orientation_message_id
          AND message.author = 'companion'
          AND message.window_id = coaching_window.window_id
          AND message.via_post_message_back = true
        WHERE coaching_window.user_id = ${userId}
          AND coaching_window.window_id = ${windowId}
          AND coaching_window.ended_at IS NULL
          AND coaching_window.orientation_status = 'ready'
        LIMIT 1
      `;
      const readyRow = ready[0];
      if (readyRow) {
        return {
          userId: readyRow.user_id,
          windowId: readyRow.window_id,
          messageId: readyRow.orientation_message_id,
          body: readyRow.body,
        };
      }

      const rows = await sql<ClaimedOpeningRow>`
        UPDATE agent_runtime.coaching_windows
        SET
          orientation_status = 'running',
          orientation_claimed_at = now(),
          updated_at = now()
        WHERE user_id = ${userId}
          AND window_id = ${windowId}
          AND ended_at IS NULL
          AND orientation_status IN ('pending', 'running')
        RETURNING user_id, window_id, orientation_message_id
      `;
      const row = rows[0];
      return row
        ? {
            userId: row.user_id,
            windowId: row.window_id,
            messageId: row.orientation_message_id,
            body: null,
          }
        : null;
    },

    markOpeningReadyQuery(userId, windowId) {
      return sql`
        UPDATE agent_runtime.coaching_windows
        SET
          orientation_status = 'ready',
          orientation_claimed_at = NULL,
          updated_at = now()
        WHERE user_id = ${userId}
          AND window_id = ${windowId}
          AND ended_at IS NULL
          AND orientation_status = 'running'
          AND EXISTS (
            SELECT 1
            FROM agent_runtime.conversation_messages AS message
            WHERE message.user_id = coaching_windows.user_id
              AND message.message_id = coaching_windows.orientation_message_id
              AND message.author = 'companion'
              AND message.window_id = coaching_windows.window_id
              AND message.via_post_message_back = true
          )
      `;
    },

    async acknowledgeOpening(userId, messageId) {
      const rows = await sql<MonitoringStateRow>`
        WITH acknowledged AS (
          UPDATE agent_runtime.coaching_windows
          SET
            orientation_status = 'completed',
            orientation_completed_at = now(),
            orientation_claimed_at = NULL,
            updated_at = now()
          WHERE user_id = ${userId}
            AND orientation_message_id = ${messageId}
            AND ended_at IS NULL
            AND orientation_status = 'ready'
          RETURNING
            user_id,
            window_id,
            started_at,
            orientation_completed_at,
            evidence_cursor,
            evidence_version,
            last_monitoring_turn_at
        )
        SELECT * FROM acknowledged
        UNION ALL
        SELECT
          user_id,
          window_id,
          started_at,
          orientation_completed_at,
          evidence_cursor,
          evidence_version,
          last_monitoring_turn_at
        FROM agent_runtime.coaching_windows
        WHERE user_id = ${userId}
          AND orientation_message_id = ${messageId}
          AND ended_at IS NULL
          AND orientation_status = 'completed'
          AND NOT EXISTS (SELECT 1 FROM acknowledged)
        LIMIT 1
      `;
      return toMonitoringState(rows[0]);
    },

    releaseOpeningQuery(userId, windowId) {
      return sql`
        UPDATE agent_runtime.coaching_windows
        SET
          orientation_status = 'pending',
          orientation_claimed_at = NULL,
          updated_at = now()
        WHERE user_id = ${userId}
          AND window_id = ${windowId}
          AND ended_at IS NULL
          AND orientation_status = 'running'
      `;
    },

    async isActive(userId, windowId) {
      const rows = await sql<{ readonly active: boolean }>`
        SELECT true AS active
        FROM agent_runtime.coaching_windows
        WHERE user_id = ${userId}
          AND window_id = ${windowId}
          AND ended_at IS NULL
        LIMIT 1
      `;
      return rows.length > 0;
    },

    async readMonitoringState(userId) {
      const rows = await sql<MonitoringStateRow>`
        SELECT
          user_id,
          window_id,
          started_at,
          orientation_completed_at,
          evidence_cursor,
          evidence_version,
          last_monitoring_turn_at
        FROM agent_runtime.coaching_windows
        WHERE user_id = ${userId}
          AND ended_at IS NULL
          AND orientation_status = 'completed'
        LIMIT 1
      `;
      const row = rows[0];
      return toMonitoringState(row);
    },

    advanceEvidenceQuery(input) {
      return sql`
        UPDATE agent_runtime.coaching_windows
        SET
          evidence_cursor = ${input.cursorEnd},
          evidence_version = ${input.evidenceVersion},
          last_monitoring_turn_at = ${input.completedAt},
          updated_at = now()
        WHERE user_id = ${input.userId}
          AND window_id = ${input.windowId}
          AND ended_at IS NULL
          AND orientation_status = 'completed'
      `;
    },

    recordJudgmentAttemptQuery(input) {
      return sql`
        UPDATE agent_runtime.coaching_windows
        SET
          last_monitoring_turn_at = ${input.attemptedAt},
          updated_at = now()
        WHERE user_id = ${input.userId}
          AND window_id = ${input.windowId}
          AND ended_at IS NULL
          AND orientation_status = 'completed'
      `;
    },
  };
}

function toMonitoringState(row: MonitoringStateRow | undefined): CoachingMonitoringState | null {
  return row
    ? {
        userId: row.user_id,
        windowId: row.window_id,
        startedAt: new Date(row.started_at),
        orientationCompletedAt: new Date(row.orientation_completed_at),
        evidenceCursor: row.evidence_cursor === null ? null : Number(row.evidence_cursor),
        evidenceVersion: row.evidence_version,
        lastMonitoringTurnAt:
          row.last_monitoring_turn_at === null ? null : new Date(row.last_monitoring_turn_at),
      }
    : null;
}
