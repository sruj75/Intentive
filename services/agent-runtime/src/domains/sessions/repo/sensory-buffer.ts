import type { ContextSnapshot, SessionEndMarker } from "@intentive/protocol";

import type { Sql } from "./sql.js";

export interface SensoryBufferReader {
  /**
   * Returns the most recent durable perception fact for a User, rendered for
   * prompt injection, or `null` when no perception has arrived yet.
   */
  readLatest(userId: string): Promise<string | null>;
}

type PerceptionEvent = ContextSnapshot | SessionEndMarker;

interface RuntimeEventRow {
  readonly payload: PerceptionEvent | string;
}

export function createSensoryBufferReader(sql: Sql): SensoryBufferReader {
  return {
    async readLatest(userId) {
      const rows = await sql<RuntimeEventRow>`
        SELECT payload
        FROM agent_runtime.runtime_events
        WHERE user_id = ${userId}
          AND kind IN ('context_snapshot', 'session_end_marker')
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const event = rows[0] ? parsePayload(rows[0].payload) : null;
      return event ? renderPerception(event) : null;
    },
  };
}

function parsePayload(payload: RuntimeEventRow["payload"]): PerceptionEvent {
  return typeof payload === "string" ? (JSON.parse(payload) as PerceptionEvent) : payload;
}

function renderPerception(event: PerceptionEvent): string {
  switch (event.type) {
    case "context_snapshot":
      return [
        "Most recent perception: Context Snapshot.",
        `Captured at: ${event.captured_at}.`,
        `Period: ${event.period_start} to ${event.period_end}.`,
        `Summary: ${event.summary}`,
      ].join("\n");
    case "session_end_marker":
      return [
        "Most recent perception: Session End Marker.",
        `Ended at: ${event.ended_at}.`,
        `Reason: ${event.reason}.`,
      ].join("\n");
  }
}
