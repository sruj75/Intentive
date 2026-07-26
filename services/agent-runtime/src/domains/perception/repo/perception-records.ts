import type { PerceptionEvent } from "@intentive/protocol";

import { structuredScreenFields } from "./screen-signals.js";
import type {
  PerceptionEmbeddingCandidate,
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

interface EmbeddingCandidateRow {
  readonly id: string;
  readonly event_id: string;
  readonly window_id: string | null;
  readonly source_client: PerceptionRecord["sourceClient"];
  readonly artifact_type: PerceptionRecord["artifactType"];
  readonly captured_at: string | Date;
  readonly period_start: string | Date;
  readonly period_end: string | Date;
  readonly summary: string;
  readonly signals: Record<string, unknown>;
  readonly bundle_id: string | null;
  readonly app_name: string | null;
  readonly window_title: string | null;
  readonly ocr_text: string | null;
  readonly content_redacted: boolean;
  readonly sensitivity_label: PerceptionRecord["sensitivityLabel"];
  readonly retention_class: string;
  readonly confidence: number;
  readonly expires_at: string | Date;
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
        WITH incoming AS (
          SELECT incoming.ingest_seq
          FROM agent_runtime.runtime_events AS incoming
          WHERE incoming.user_id = ${record.userId}
            AND incoming.kind = 'perception_event'
            AND incoming.dedup_key = ${record.eventId}
        ),
        eligible_incoming AS (
          SELECT incoming.ingest_seq
          FROM incoming
          WHERE NOT EXISTS (
            SELECT 1
            FROM agent_runtime.runtime_events AS tombstone
            WHERE tombstone.user_id = ${record.userId}
              AND tombstone.kind = 'perception_tombstone'
              AND tombstone.ingest_seq > incoming.ingest_seq
              AND (
                tombstone.payload->>'reason' = 'clear_all'
                OR (
                  tombstone.payload->'event_refs'
                    @> jsonb_build_array(${record.eventId}::text)
                )
              )
          )
        )
        INSERT INTO agent_runtime.perception_records
          (
            user_id,
            event_id,
            window_id,
            source_client,
            artifact_type,
            captured_at,
            period_start,
            period_end,
            summary,
            signals,
            bundle_id,
            app_name,
            window_title,
            ocr_text,
            content_redacted,
            sensitivity_label,
            retention_class,
            confidence,
            expires_at,
            local_record_ref
          )
        SELECT
          ${record.userId},
          ${record.eventId},
          ${record.windowId},
          ${record.sourceClient},
          ${record.artifactType},
          ${record.capturedAt},
          ${record.periodStart},
          ${record.periodEnd},
          ${record.summary},
          ${JSON.stringify(record.signals)}::jsonb,
          ${record.bundleId},
          ${record.appName},
          ${record.windowTitle},
          ${record.ocrText},
          ${record.contentRedacted},
          ${record.sensitivityLabel},
          ${record.retentionClass},
          ${record.confidence},
          ${record.expiresAt},
          ${record.localRecordRef}
        FROM eligible_incoming
        ON CONFLICT (user_id, event_id) DO UPDATE SET
          -- A legacy retry must not erase a window association established by a
          -- newer Desktop re-emit of the same stable event identity.
          window_id = COALESCE(excluded.window_id, perception_records.window_id),
          -- Redaction is monotonic for a stable event identity. Once detailed
          -- fields have been replaced by a redacted re-emission, a delayed
          -- permitted retry cannot restore those fields to the projection.
          summary = CASE
            WHEN perception_records.content_redacted
              AND NOT excluded.content_redacted
            THEN perception_records.summary
            ELSE excluded.summary
          END,
          signals = CASE
            WHEN perception_records.content_redacted
              AND NOT excluded.content_redacted
            THEN perception_records.signals
            ELSE excluded.signals
          END,
          bundle_id = CASE
            WHEN perception_records.content_redacted
              AND NOT excluded.content_redacted
            THEN perception_records.bundle_id
            ELSE excluded.bundle_id
          END,
          app_name = CASE
            WHEN perception_records.content_redacted
              AND NOT excluded.content_redacted
            THEN perception_records.app_name
            ELSE excluded.app_name
          END,
          window_title = CASE
            WHEN perception_records.content_redacted OR excluded.content_redacted
            THEN NULL
            ELSE excluded.window_title
          END,
          ocr_text = CASE
            WHEN perception_records.content_redacted OR excluded.content_redacted
            THEN NULL
            ELSE excluded.ocr_text
          END,
          content_redacted =
            perception_records.content_redacted OR excluded.content_redacted,
          sensitivity_label = CASE
            WHEN perception_records.content_redacted
              AND NOT excluded.content_redacted
            THEN perception_records.sensitivity_label
            ELSE excluded.sensitivity_label
          END,
          retention_class = excluded.retention_class,
          confidence = excluded.confidence,
          expires_at = excluded.expires_at,
          local_record_ref = excluded.local_record_ref,
          embedding_model_id = CASE
            WHEN perception_records.artifact_type IS DISTINCT FROM excluded.artifact_type
              OR perception_records.summary IS DISTINCT FROM excluded.summary
              OR perception_records.signals IS DISTINCT FROM excluded.signals
              OR perception_records.app_name IS DISTINCT FROM excluded.app_name
              OR perception_records.window_title IS DISTINCT FROM excluded.window_title
              OR perception_records.ocr_text IS DISTINCT FROM excluded.ocr_text
              OR perception_records.content_redacted
                IS DISTINCT FROM excluded.content_redacted
            THEN NULL
            ELSE perception_records.embedding_model_id
          END,
          embedding_dim = CASE
            WHEN perception_records.artifact_type IS DISTINCT FROM excluded.artifact_type
              OR perception_records.summary IS DISTINCT FROM excluded.summary
              OR perception_records.signals IS DISTINCT FROM excluded.signals
              OR perception_records.app_name IS DISTINCT FROM excluded.app_name
              OR perception_records.window_title IS DISTINCT FROM excluded.window_title
              OR perception_records.ocr_text IS DISTINCT FROM excluded.ocr_text
              OR perception_records.content_redacted
                IS DISTINCT FROM excluded.content_redacted
            THEN NULL
            ELSE perception_records.embedding_dim
          END,
          embedding = CASE
            WHEN perception_records.artifact_type IS DISTINCT FROM excluded.artifact_type
              OR perception_records.summary IS DISTINCT FROM excluded.summary
              OR perception_records.signals IS DISTINCT FROM excluded.signals
              OR perception_records.app_name IS DISTINCT FROM excluded.app_name
              OR perception_records.window_title IS DISTINCT FROM excluded.window_title
              OR perception_records.ocr_text IS DISTINCT FROM excluded.ocr_text
              OR perception_records.content_redacted
                IS DISTINCT FROM excluded.content_redacted
            THEN NULL
            ELSE perception_records.embedding
          END
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

    async readEmbeddingCandidate(expectedRecord) {
      const [row] = await sql<EmbeddingCandidateRow>`
        SELECT
          id,
          event_id,
          window_id,
          source_client,
          artifact_type,
          captured_at,
          period_start,
          period_end,
          summary,
          signals,
          bundle_id,
          app_name,
          window_title,
          ocr_text,
          content_redacted,
          sensitivity_label,
          retention_class,
          confidence,
          expires_at,
          local_record_ref
        FROM agent_runtime.perception_records
        WHERE user_id = ${expectedRecord.userId}
          AND event_id = ${expectedRecord.eventId}
          AND artifact_type = ${expectedRecord.artifactType}
          AND summary = ${expectedRecord.summary}
          AND signals = ${JSON.stringify(expectedRecord.signals)}::jsonb
          AND app_name IS NOT DISTINCT FROM ${expectedRecord.appName}
          AND window_title IS NOT DISTINCT FROM ${expectedRecord.windowTitle}
          AND ocr_text IS NOT DISTINCT FROM ${expectedRecord.ocrText}
          AND content_redacted = ${expectedRecord.contentRedacted}
          AND expires_at = ${expectedRecord.expiresAt}
          AND expires_at > now()
        LIMIT 1
      `;
      return row ? toEmbeddingCandidate(expectedRecord.userId, row) : null;
    },

    async storeEmbedding({ modelId, vector, expectedRecord }) {
      await sql`
        UPDATE agent_runtime.perception_records
        SET
          embedding_model_id = ${modelId},
          embedding_dim = ${vector.length},
          embedding = ${vectorLiteral(vector)}::vector
        WHERE id = ${expectedRecord.projectionId}
          AND user_id = ${expectedRecord.userId}
          AND event_id = ${expectedRecord.eventId}
          AND artifact_type = ${expectedRecord.artifactType}
          AND summary = ${expectedRecord.summary}
          AND signals = ${JSON.stringify(expectedRecord.signals)}::jsonb
          AND app_name IS NOT DISTINCT FROM ${expectedRecord.appName}
          AND window_title IS NOT DISTINCT FROM ${expectedRecord.windowTitle}
          AND ocr_text IS NOT DISTINCT FROM ${expectedRecord.ocrText}
          AND content_redacted = ${expectedRecord.contentRedacted}
          AND expires_at = ${expectedRecord.expiresAt}
          AND expires_at > now()
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
            OR to_tsvector(
                 'simple',
                 summary
                   || ' ' || coalesce(app_name, '')
                   || ' ' || coalesce(window_title, '')
                   || ' ' || coalesce(ocr_text, '')
               ) @@ plainto_tsquery('simple', ${trimmedQuery})
          )
        ORDER BY
          CASE
            WHEN ${trimmedQuery} = '' THEN 0
            ELSE ts_rank_cd(
              to_tsvector(
                'simple',
                summary
                  || ' ' || coalesce(app_name, '')
                  || ' ' || coalesce(window_title, '')
                  || ' ' || coalesce(ocr_text, '')
              ),
              plainto_tsquery('simple', ${trimmedQuery})
            )
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
  const screen = structuredScreenFields(event);
  return {
    userId,
    eventId: event.event_id,
    windowId: event.window_id ?? null,
    sourceClient: event.source_client,
    artifactType: event.artifact_type,
    capturedAt: event.captured_at,
    periodStart: event.period_start,
    periodEnd: event.period_end,
    summary: event.summary,
    signals: event.signals,
    bundleId: screen.bundleId,
    appName: screen.appName,
    windowTitle: screen.windowTitle,
    ocrText: screen.ocrText,
    contentRedacted: screen.contentRedacted,
    sensitivityLabel: event.sensitivity_label,
    retentionClass: event.retention_class,
    confidence: event.confidence,
    expiresAt: event.expires_at,
    localRecordRef: event.local_record_ref,
  };
}

export function perceptionRecordEmbeddingText(record: PerceptionRecord): string {
  if (record.artifactType === "searchable_screen_record") {
    return joinEmbeddingText([record.summary, record.appName, record.windowTitle, record.ocrText]);
  }
  const signalText = Object.values(record.signals).filter(
    (value): value is string => typeof value === "string",
  );
  return joinEmbeddingText([record.summary, ...signalText]);
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

function toEmbeddingCandidate(
  userId: string,
  row: EmbeddingCandidateRow,
): PerceptionEmbeddingCandidate {
  return {
    projectionId: row.id,
    userId,
    eventId: row.event_id,
    windowId: row.window_id,
    sourceClient: row.source_client,
    artifactType: row.artifact_type,
    capturedAt: toIsoString(row.captured_at),
    periodStart: toIsoString(row.period_start),
    periodEnd: toIsoString(row.period_end),
    summary: row.summary,
    signals: row.signals,
    bundleId: row.bundle_id,
    appName: row.app_name,
    windowTitle: row.window_title,
    ocrText: row.ocr_text,
    contentRedacted: row.content_redacted,
    sensitivityLabel: row.sensitivity_label,
    retentionClass: row.retention_class,
    confidence: row.confidence,
    expiresAt: toIsoString(row.expires_at),
    localRecordRef: row.local_record_ref,
  };
}

function joinEmbeddingText(parts: (string | null | undefined)[]): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n")
    .trim();
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
