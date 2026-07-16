import type {
  ClientKind,
  PerceptionArtifactType,
  PerceptionSensitivityLabel,
  PerceptionTombstone,
} from "@intentive/protocol";

export interface PerceptionRecord {
  readonly userId: string;
  readonly eventId: string;
  readonly sourceClient: ClientKind;
  readonly artifactType: PerceptionArtifactType;
  readonly capturedAt: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly summary: string;
  readonly signals: Record<string, unknown>;
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

export interface PerceptionRecordsRepo {
  appendQuery(record: PerceptionRecord): Promise<{ id: string }[]>;
  /**
   * Tenant-scoped deletion query for a `perception_tombstone`. `clear_all` drops
   * every row for the user; otherwise the named `event_refs` are dropped. Always
   * scoped by `user_id`, and idempotent on redelivery.
   */
  tombstoneQuery(userId: string, tombstone: PerceptionTombstone): Promise<unknown[]>;
  /**
   * Best-effort out-of-transaction enrichment: store Agent Runtime-computed vector
   * for one record. No-op if the record no longer exists (e.g. tombstoned).
   */
  storeEmbedding(input: {
    readonly userId: string;
    readonly eventId: string;
    readonly modelId: string;
    readonly vector: number[];
  }): Promise<void>;
  search(input: ScreenContextSearchInput): Promise<ScreenContextSearchResult[]>;
}
