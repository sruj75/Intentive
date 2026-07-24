import { searchableScreenRecordSignals, type PerceptionEvent } from "@intentive/protocol";

/**
 * The structured, permitted screen fields Agent Runtime persists as first-class
 * columns for a perception record. Only `searchable_screen_record` populates
 * them; every other artifact type leaves them null. A redacted (secret-detected)
 * record carries app identity only — `windowTitle` and `ocrText` stay null so
 * the secret text is never stored or indexed.
 */
export interface StructuredScreenFields {
  readonly bundleId: string | null;
  readonly appName: string | null;
  readonly windowTitle: string | null;
  readonly ocrText: string | null;
  readonly contentRedacted: boolean;
}

const EMPTY_SCREEN_FIELDS: StructuredScreenFields = {
  bundleId: null,
  appName: null,
  windowTitle: null,
  ocrText: null,
  contentRedacted: false,
};

/**
 * Extract the permitted screen columns from a perception event for Agent Runtime.
 * The event has
 * already passed the protocol boundary, so a `searchable_screen_record` is
 * guaranteed to carry one of the two `searchableScreenRecordSignals` shapes; the
 * parse here is a narrowing, not a re-validation.
 */
export function structuredScreenFields(event: PerceptionEvent): StructuredScreenFields {
  if (event.artifact_type !== "searchable_screen_record") {
    return EMPTY_SCREEN_FIELDS;
  }
  const parsed = searchableScreenRecordSignals.safeParse(event.signals);
  if (!parsed.success) {
    // Defensive: the boundary already guarantees the shape. Treat an unexpected
    // payload as fully redacted so no unpermitted text is ever persisted.
    return { ...EMPTY_SCREEN_FIELDS, contentRedacted: true };
  }
  if (parsed.data.content_redacted) {
    return {
      bundleId: parsed.data.bundle_id,
      appName: parsed.data.app_name,
      windowTitle: null,
      ocrText: null,
      contentRedacted: true,
    };
  }
  return {
    bundleId: parsed.data.bundle_id,
    appName: parsed.data.app_name,
    windowTitle: parsed.data.window_title,
    ocrText: parsed.data.ocr_text,
    contentRedacted: false,
  };
}

/**
 * The permitted text Agent Runtime embeds for a record: summary plus app identity,
 * window title, and OCR for a permitted screen record; summary plus app identity
 * for a redacted one; summary plus flattened string signals for every other
 * artifact type. Secret text is structurally absent, so it is never embedded.
 */
export function permittedEmbeddingText(event: PerceptionEvent): string {
  if (event.artifact_type === "searchable_screen_record") {
    const fields = structuredScreenFields(event);
    return joinText([event.summary, fields.appName, fields.windowTitle, fields.ocrText]);
  }
  const signalText = Object.values(event.signals).filter(
    (value): value is string => typeof value === "string",
  );
  return joinText([event.summary, ...signalText]);
}

function joinText(parts: (string | null | undefined)[]): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n")
    .trim();
}
