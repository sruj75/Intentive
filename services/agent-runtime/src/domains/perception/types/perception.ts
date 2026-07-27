import type {
  ClientKind,
  PerceptionArtifactType,
  PerceptionSensitivityLabel,
  PerceptionTombstone,
} from "@intentive/protocol";

export interface PerceptionRecord {
  readonly userId: string;
  readonly eventId: string;
  /** Null only for backward-compatible events produced before Coaching Windows. */
  readonly windowId: string | null;
  readonly sourceClient: ClientKind;
  readonly artifactType: PerceptionArtifactType;
  readonly capturedAt: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly summary: string;
  readonly signals: Record<string, unknown>;
  // Structured permitted screen columns for `searchable_screen_record` (null for
  // other artifact types). A redacted record carries app identity only:
  // `windowTitle`/`ocrText` are null and `contentRedacted` is true.
  readonly bundleId: string | null;
  readonly appName: string | null;
  readonly windowTitle: string | null;
  readonly ocrText: string | null;
  readonly contentRedacted: boolean;
  readonly sensitivityLabel: PerceptionSensitivityLabel;
  readonly retentionClass: string;
  readonly confidence: number;
  readonly expiresAt: string;
  readonly localRecordRef: string;
}

export interface ScreenContextSearchInput {
  readonly userId: string;
  readonly query: string;
  readonly limit?: number;
}

export interface ScreenContextSearchResult {
  readonly eventId: string;
  readonly sourceClient: ClientKind;
  readonly artifactType: PerceptionArtifactType;
  readonly capturedAt: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly summary: string;
  readonly sensitivityLabel: PerceptionSensitivityLabel;
  readonly confidence: number;
  readonly localRecordRef: string;
}

/**
 * Agent Runtime's own embedding space for Screen Memory retrieval. Agent Runtime
 * computes its own vectors from synchronized text rather than trusting the
 * client `embedding_ref` — a model change only widens/degrades recall, never
 * corrupts it. `embed` returns `null` when the provider is degraded/unavailable
 * so search falls back to FTS alone.
 */
export interface PerceptionEmbedder {
  readonly modelId: string;
  readonly dim: number;
  embed(text: string): Promise<number[] | null>;
}

/**
 * One live projection row whose exact permitted content was read for embedding.
 * `projectionId` prevents a delayed provider result from attaching to a
 * delete-and-recreate row that happens to reuse the same event identity.
 */
export interface PerceptionEmbeddingCandidate extends PerceptionRecord {
  readonly projectionId: string;
}

export interface StorePerceptionEmbeddingInput {
  readonly modelId: string;
  readonly vector: number[];
  /** Exact projected content used to compute `vector`; stale writes are rejected. */
  readonly expectedRecord: PerceptionEmbeddingCandidate;
}

export interface PerceptionRecordsRepo {
  /**
   * Projects the matching `runtime_events(kind = 'perception_event')` arrival.
   * Callers commit that ledger marker before this query in the same ordered
   * transaction. A later ledgered tombstone makes delayed redelivery a no-op.
   */
  appendQuery(record: PerceptionRecord): Promise<{ id: string }[]>;
  /**
   * Returns canonical embedding material only while the current, unexpired
   * projection still exactly matches the input that requested enrichment.
   */
  readEmbeddingCandidate(
    expectedRecord: PerceptionRecord,
  ): Promise<PerceptionEmbeddingCandidate | null>;
  /**
   * Tenant-scoped deletion query for a `perception_tombstone`. `clear_all` drops
   * every row for the user; otherwise the named `event_refs` are dropped. Always
   * scoped by `user_id`, and idempotent on redelivery.
   */
  tombstoneQuery(userId: string, tombstone: PerceptionTombstone): Promise<unknown[]>;
  /**
   * Best-effort out-of-transaction enrichment: store Agent Runtime-computed vector
   * for one exact live projection. No-op after content/redaction drift, expiry,
   * tombstoning, or delete-and-recreate replacement.
   */
  storeEmbedding(input: StorePerceptionEmbeddingInput): Promise<void>;
  search(input: ScreenContextSearchInput): Promise<ScreenContextSearchResult[]>;
}
