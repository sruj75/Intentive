import type { PerceptionEvent } from "@intentive/protocol";

import type {
  PerceptionRecord,
  PerceptionRecordsRepo,
  ScreenContextSearchResult,
} from "../types/perception.js";
import type { Sql } from "./sql.js";

interface SearchRow {
  readonly event_id: string;
  readonly source_client: ScreenContextSearchResult["sourceClient"];
  readonly artifact_type: ScreenContextSearchResult["artifactType"];
  readonly captured_at: string | Date;
  readonly period_start: string | Date;
  readonly period_end: string | Date;
  readonly summary: string;
  readonly sensitivity_label: ScreenContextSearchResult["sensitivityLabel"];
  readonly confidence: number;
  readonly local_record_ref: string;
}

export function createPerceptionRecordsRepo(sql: Sql): PerceptionRecordsRepo {
  return {
    appendQuery(record) {
      return sql<{ id: string }>`
        INSERT INTO agent_runtime.perception_records
          (
            user_id,
            event_id,
            source_client,
            artifact_type,
            captured_at,
            period_start,
            period_end,
            summary,
            signals,
            embedding_model_id,
            embedding_dim,
            embedding,
            sensitivity_label,
            retention_class,
            confidence,
            local_record_ref
          )
        VALUES (
          ${record.userId},
          ${record.eventId},
          ${record.sourceClient},
          ${record.artifactType},
          ${record.capturedAt},
          ${record.periodStart},
          ${record.periodEnd},
          ${record.summary},
          ${JSON.stringify(record.signals)}::jsonb,
          ${record.embeddingRef?.model_id ?? null},
          ${record.embeddingRef?.dim ?? null},
          ${record.embeddingRef ? vectorLiteral(record.embeddingRef.vector) : null}::vector,
          ${record.sensitivityLabel},
          ${record.retentionClass},
          ${record.confidence},
          ${record.localRecordRef}
        )
        ON CONFLICT (user_id, event_id) DO NOTHING
        RETURNING id
      `;
    },

    async search({ userId, query, limit = 5 }) {
      const trimmedQuery = query.trim();
      const rows = await sql<SearchRow>`
        SELECT
          event_id,
          source_client,
          artifact_type,
          captured_at,
          period_start,
          period_end,
          summary,
          sensitivity_label,
          confidence,
          local_record_ref
        FROM agent_runtime.perception_records
        WHERE user_id = ${userId}
          AND (
            ${trimmedQuery} = ''
            OR to_tsvector('simple', summary) @@ plainto_tsquery('simple', ${trimmedQuery})
          )
        ORDER BY
          CASE
            WHEN ${trimmedQuery} = '' THEN 0
            ELSE ts_rank_cd(to_tsvector('simple', summary), plainto_tsquery('simple', ${trimmedQuery}))
          END DESC,
          captured_at DESC
        LIMIT ${Math.max(1, Math.min(limit, 10))}
      `;

      return rows.map(toSearchResult);
    },
  };
}

export function toPerceptionRecord(userId: string, event: PerceptionEvent): PerceptionRecord {
  return {
    userId,
    eventId: event.event_id,
    sourceClient: event.source_client,
    artifactType: event.artifact_type,
    capturedAt: event.captured_at,
    periodStart: event.period_start,
    periodEnd: event.period_end,
    summary: event.summary,
    signals: event.signals,
    embeddingRef: event.embedding_ref ?? null,
    sensitivityLabel: event.sensitivity_label,
    retentionClass: event.retention_class,
    confidence: event.confidence,
    localRecordRef: event.local_record_ref,
  };
}

function vectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}

function toSearchResult(row: SearchRow): ScreenContextSearchResult {
  return {
    eventId: row.event_id,
    sourceClient: row.source_client,
    artifactType: row.artifact_type,
    capturedAt: toIsoString(row.captured_at),
    periodStart: toIsoString(row.period_start),
    periodEnd: toIsoString(row.period_end),
    summary: row.summary,
    sensitivityLabel: row.sensitivity_label,
    confidence: row.confidence,
    localRecordRef: row.local_record_ref,
  };
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
