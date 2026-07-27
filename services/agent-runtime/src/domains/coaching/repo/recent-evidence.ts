import { createHash } from "node:crypto";

import type { RecentCoachingEvidence, RecentCoachingEvidenceReader } from "../types/coaching.js";
import type { Sql } from "./sql.js";

interface UpperCursorRow {
  readonly upper_cursor: string | null;
}

interface EvidenceRow {
  readonly ingest_seq: string;
  readonly event_id: string;
  readonly artifact_type: string;
  readonly captured_at: string | Date;
  readonly period_start: string | Date;
  readonly period_end: string | Date;
  readonly summary: string;
  readonly app_name: string | null;
  readonly window_title: string | null;
  readonly ocr_text: string | null;
  readonly signals: unknown;
  readonly content_redacted: boolean;
  readonly sensitivity_label: string;
  readonly confidence: number;
}

const DEFAULT_LIMIT = 32;
const DEFAULT_MAX_CHARACTERS = 12_000;

export function createRecentCoachingEvidenceReader(sql: Sql): RecentCoachingEvidenceReader {
  return {
    async read(input) {
      const [upper] = await sql<UpperCursorRow>`
        SELECT max(event.ingest_seq)::text AS upper_cursor
        FROM agent_runtime.runtime_events AS event
        JOIN agent_runtime.perception_records AS projection
          ON projection.user_id = event.user_id
          AND event.dedup_key = projection.event_id
        WHERE event.user_id = ${input.userId}
          AND event.kind = 'perception_event'
          AND projection.window_id = ${input.windowId}
          AND projection.expires_at > now()
      `;
      if (!upper?.upper_cursor) {
        return null;
      }

      const upperCursor = Number(upper.upper_cursor);
      const afterCursor = input.afterCursor ?? 0;
      if (upperCursor <= afterCursor) {
        return null;
      }
      const limit = boundedPositiveInteger(input.limit, DEFAULT_LIMIT);
      const maxCharacters = boundedPositiveInteger(input.maxCharacters, DEFAULT_MAX_CHARACTERS);
      const rows = await sql<EvidenceRow>`
        SELECT
          event.ingest_seq::text,
          projection.event_id,
          projection.artifact_type,
          projection.captured_at,
          projection.period_start,
          projection.period_end,
          projection.summary,
          projection.app_name,
          projection.window_title,
          projection.ocr_text,
          projection.signals,
          projection.content_redacted,
          projection.sensitivity_label,
          projection.confidence
        FROM agent_runtime.runtime_events AS event
        JOIN agent_runtime.perception_records AS projection
          ON projection.user_id = event.user_id
          AND event.dedup_key = projection.event_id
        WHERE event.user_id = ${input.userId}
          AND event.kind = 'perception_event'
          AND projection.window_id = ${input.windowId}
          AND projection.expires_at > now()
          AND event.ingest_seq > ${afterCursor}
          AND event.ingest_seq <= ${upperCursor}
        ORDER BY event.ingest_seq ASC
        LIMIT ${limit}
      `;
      return renderBatch(input.windowId, rows, maxCharacters);
    },

    async isCurrent(input) {
      const rows = await sql<EvidenceRow>`
        SELECT
          event.ingest_seq::text,
          projection.event_id,
          projection.artifact_type,
          projection.captured_at,
          projection.period_start,
          projection.period_end,
          projection.summary,
          projection.app_name,
          projection.window_title,
          projection.ocr_text,
          projection.signals,
          projection.content_redacted,
          projection.sensitivity_label,
          projection.confidence
        FROM agent_runtime.runtime_events AS event
        JOIN agent_runtime.perception_records AS projection
          ON projection.user_id = event.user_id
          AND event.dedup_key = projection.event_id
        WHERE event.user_id = ${input.userId}
          AND event.kind = 'perception_event'
          AND projection.window_id = ${input.windowId}
          AND projection.expires_at > now()
          AND event.ingest_seq >= ${input.cursorStart}
          AND event.ingest_seq <= ${input.cursorEnd}
        ORDER BY event.ingest_seq ASC
      `;
      const current = renderBatch(input.windowId, rows, DEFAULT_MAX_CHARACTERS);
      return (
        current !== null &&
        current.cursorStart === input.cursorStart &&
        current.cursorEnd === input.cursorEnd &&
        current.version === input.version
      );
    },
  };
}

function boundedPositiveInteger(value: number | undefined, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return maximum;
  }
  return Math.max(1, Math.min(Math.floor(value), maximum));
}

function renderBatch(
  windowId: string,
  rows: readonly EvidenceRow[],
  maxCharacters: number,
): RecentCoachingEvidence | null {
  if (rows.length === 0) {
    return null;
  }
  const budget = Math.max(1, maxCharacters);
  const renderedEvents: string[] = [];
  const included: EvidenceRow[] = [];
  let used = 0;

  for (const row of rows) {
    const separator = renderedEvents.length === 0 ? "" : "\n\n";
    const available = budget - used - separator.length;
    if (available <= 0) {
      break;
    }
    const rendered = renderEvent(row);
    if (rendered.length > available) {
      if (included.length === 0) {
        renderedEvents.push(rendered.slice(0, available));
        included.push(row);
      }
      break;
    }
    renderedEvents.push(rendered);
    included.push(row);
    used += separator.length + rendered.length;
  }

  if (included.length === 0) {
    return null;
  }
  const cursorStart = Number(included[0]!.ingest_seq);
  const cursorEnd = Number(included[included.length - 1]!.ingest_seq);
  const rendered = renderedEvents.join("\n\n");
  const projectionDigest = createHash("sha256").update(rendered).digest("hex");
  return {
    windowId,
    cursorStart,
    cursorEnd,
    version: `${windowId}:${cursorStart}-${cursorEnd}:${projectionDigest}`,
    eventIds: included.map((row) => row.event_id),
    oldestCapturedAt: new Date(included[0]!.captured_at),
    rendered,
  };
}

function renderEvent(row: EvidenceRow): string {
  const lines = [`[${row.ingest_seq}] ${row.artifact_type} at ${toIsoString(row.captured_at)}`];
  if (row.app_name) {
    lines.push(`App: ${row.app_name}`);
  }
  if (row.window_title) {
    lines.push(`Window: ${row.window_title}`);
  }
  lines.push(`Summary: ${row.summary}`);
  lines.push(...renderApprovedSignals(row.artifact_type, row.signals));
  if (!row.content_redacted && row.ocr_text) {
    lines.push(`Visible text: ${row.ocr_text}`);
  }
  return lines.join("\n");
}

function renderApprovedSignals(artifactType: string, value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  switch (artifactType) {
    case "focus_signal":
      return [
        renderStringSignal("Previous app", value.previous_app),
        renderStringSignal("Current app", value.current_app),
      ].filter(isRenderedSignal);
    case "activity_summary":
      return [
        renderNumberSignal("Frame count", value.frame_count),
        renderNumberSignal("App count", value.app_count),
      ].filter(isRenderedSignal);
    case "ambient_audio_summary":
      return [
        renderStringSignal("Audio source", value.audio_source),
        renderBooleanSignal("Transcript redacted", value.transcript_redacted),
        renderNumberSignal("Transcript word count", value.transcript_word_count),
      ].filter(isRenderedSignal);
    default:
      return [];
  }
}

function renderStringSignal(label: string, value: unknown): string | null {
  return typeof value === "string" ? `${label}: ${value}` : null;
}

function renderNumberSignal(label: string, value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `${label}: ${value}` : null;
}

function renderBooleanSignal(label: string, value: unknown): string | null {
  return typeof value === "boolean" ? `${label}: ${value}` : null;
}

function isRenderedSignal(value: string | null): value is string {
  return value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
