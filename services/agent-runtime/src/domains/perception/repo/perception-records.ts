import type { PerceptionEvent } from "@intentive/protocol";

import type {
  PerceptionEmbedder,
  PerceptionRecord,
  PerceptionRecordsRepo,
  ScreenContextSearchInput,
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

// On-device local search leads with FTS and appends vector-only recalls above
// this cosine similarity — the same threshold the desktop uses (Omi's 0.5). Here
// it governs Agent Runtime's own hybrid ranking.
const SEMANTIC_RECALL_THRESHOLD = 0.5;

export function createPerceptionRecordsRepo(
  sql: Sql,
  embedder?: PerceptionEmbedder,
): PerceptionRecordsRepo {
  return {
    appendQuery(record) {
      // Agent Runtime owns its own embedding space (see `storeEmbedding`); the
      // client `embedding_ref` is parsed-and-dropped, never persisted as truth.
      // Repeated `event_id`s reconcile content, retention class, and expiry — a
      // re-emit after a retention change updates the row without duplicating it.
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
            sensitivity_label,
            retention_class,
            confidence,
            expires_at,
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
          ${record.sensitivityLabel},
          ${record.retentionClass},
          ${record.confidence},
          ${record.expiresAt},
          ${record.localRecordRef}
        )
        ON CONFLICT (user_id, event_id) DO UPDATE SET
          summary = excluded.summary,
          signals = excluded.signals,
          sensitivity_label = excluded.sensitivity_label,
          retention_class = excluded.retention_class,
          confidence = excluded.confidence,
          expires_at = excluded.expires_at,
          local_record_ref = excluded.local_record_ref
        RETURNING id
      `;
    },

    tombstoneQuery(userId, tombstone) {
      if (tombstone.reason === "clear_all") {
        return sql`
          DELETE FROM agent_runtime.perception_records
          WHERE user_id = ${userId}
        `;
      }
      return sql`
        DELETE FROM agent_runtime.perception_records
        WHERE user_id = ${userId}
          AND event_id = ANY(${tombstone.event_refs})
      `;
    },

    async storeEmbedding({ userId, eventId, modelId, vector }) {
      await sql`
        UPDATE agent_runtime.perception_records
        SET
          embedding_model_id = ${modelId},
          embedding_dim = ${vector.length},
          embedding = ${vectorLiteral(vector)}::vector
        WHERE user_id = ${userId} AND event_id = ${eventId}
      `;
    },

    async search({ userId, query, limit = 5 }) {
      const cappedLimit = Math.max(1, Math.min(limit, 10));
      const trimmedQuery = query.trim();

      const lexical = await sql<SearchRow>`
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
          AND expires_at > now()
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
        LIMIT ${cappedLimit}
      `;

      const results = lexical.map(toSearchResult);

      // Hybrid recall: append Agent Runtime's own vector neighbours for anything
      // FTS missed. Degraded/unavailable embedder → `null` → FTS-only, no error.
      const queryVector =
        trimmedQuery !== "" && embedder ? await embedRaw(embedder, trimmedQuery) : null;
      if (queryVector && embedder) {
        const seen = new Set(results.map((result) => result.eventId));
        const vectorRows = await sql<SearchRow>`
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
            AND expires_at > now()
            AND embedding IS NOT NULL
            AND embedding_model_id = ${embedder.modelId}
            AND 1 - (embedding <=> ${vectorLiteral(queryVector)}::vector) > ${SEMANTIC_RECALL_THRESHOLD}
          ORDER BY embedding <=> ${vectorLiteral(queryVector)}::vector
          LIMIT ${cappedLimit}
        `;
        for (const row of vectorRows) {
          if (results.length >= cappedLimit) break;
          if (seen.has(row.event_id)) continue;
          seen.add(row.event_id);
          results.push(toSearchResult(row));
        }
      }

      return results;
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
    sensitivityLabel: event.sensitivity_label,
    retentionClass: event.retention_class,
    confidence: event.confidence,
    expiresAt: event.expires_at,
    localRecordRef: event.local_record_ref,
  };
}

/** The text Agent Runtime embeds for a record: summary plus flattened signal values. */
export function embeddingText(event: PerceptionEvent): string {
  const signalText = Object.values(event.signals)
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return [event.summary, signalText].filter(Boolean).join("\n").trim();
}

async function embedRaw(embedder: PerceptionEmbedder, text: string): Promise<number[] | null> {
  try {
    return await embedder.embed(text);
  } catch {
    return null;
  }
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
