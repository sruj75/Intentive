import type {
  ClientKind,
  PerceptionArtifactType,
  PerceptionEmbeddingRef,
  PerceptionSensitivityLabel,
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
  readonly embeddingRef: PerceptionEmbeddingRef | null;
  readonly sensitivityLabel: PerceptionSensitivityLabel;
  readonly retentionClass: string;
  readonly confidence: number;
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

export interface PerceptionRecordsRepo {
  appendQuery(record: PerceptionRecord): Promise<{ id: string }[]>;
  search(input: ScreenContextSearchInput): Promise<ScreenContextSearchResult[]>;
}
