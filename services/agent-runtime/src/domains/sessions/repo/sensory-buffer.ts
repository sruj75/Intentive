import type { PerceptionEvent, SessionEndMarker } from "@intentive/protocol";

import type { Sql } from "./sql.js";

export interface SensoryBufferReader {
  /**
   * Returns the most recent durable perception fact for a User, rendered for
   * prompt injection, or `null` when no perception has arrived yet.
   */
  readLatest(userId: string): Promise<string | null>;
}

type SensoryBufferEvent = PerceptionEvent | SessionEndMarker;

interface RuntimeEventRow {
  readonly payload: SensoryBufferEvent | string;
}

export function createSensoryBufferReader(sql: Sql): SensoryBufferReader {
  return {
    async readLatest(userId) {
      const rows = await sql<RuntimeEventRow>`
        SELECT payload
        FROM agent_runtime.runtime_events
        WHERE user_id = ${userId}
          AND kind IN ('perception_event', 'session_end_marker')
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const event = rows[0] ? parsePayload(rows[0].payload) : null;
      return event ? renderPerception(event) : null;
    },
  };
}

function parsePayload(payload: RuntimeEventRow["payload"]): SensoryBufferEvent {
  return typeof payload === "string" ? (JSON.parse(payload) as SensoryBufferEvent) : payload;
}

function renderPerception(event: SensoryBufferEvent): string {
  switch (event.type) {
    case "perception_event":
      return [
        "Most recent perception: Perception Event.",
        `Artifact: ${event.artifact_type}.`,
        `Source: ${event.source_client}.`,
        `Captured at: ${event.captured_at}.`,
        `Period: ${event.period_start} to ${event.period_end}.`,
        `Sensitivity: ${event.sensitivity_label}.`,
        `Confidence: ${event.confidence}.`,
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
