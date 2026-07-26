import type { PerceptionEvent } from "@intentive/protocol";

import type { BoundSession, PerceptionProjectedSink } from "../../sessions/types/event.js";
import { perceptionRecordEmbeddingText, toPerceptionRecord } from "../repo/perception-records.js";
import type {
  PerceptionEmbeddingCandidate,
  PerceptionEmbedder,
  PerceptionRecord,
  StorePerceptionEmbeddingInput,
} from "../types/perception.js";

export interface PerceptionIngressHooks {
  readonly onPerceptionProjected: PerceptionProjectedSink;
}

export function createPerceptionIngressHooks(deps: {
  readonly embedder: PerceptionEmbedder;
  readonly loadEmbeddingCandidate: (
    expectedRecord: PerceptionRecord,
  ) => Promise<PerceptionEmbeddingCandidate | null>;
  readonly storeEmbedding: (input: StorePerceptionEmbeddingInput) => Promise<void>;
  readonly onEmbeddingError: (
    error: unknown,
    context: { readonly userId: string; readonly eventId: string },
  ) => void;
}): PerceptionIngressHooks {
  return {
    onPerceptionProjected(session, event) {
      void enrichEmbedding(session, event, deps).catch((error: unknown) => {
        deps.onEmbeddingError(error, {
          userId: session.userId,
          eventId: event.event_id,
        });
      });
    },
  };
}

async function enrichEmbedding(
  session: BoundSession,
  event: PerceptionEvent,
  deps: {
    readonly embedder: PerceptionEmbedder;
    readonly loadEmbeddingCandidate: (
      expectedRecord: PerceptionRecord,
    ) => Promise<PerceptionEmbeddingCandidate | null>;
    readonly storeEmbedding: (input: StorePerceptionEmbeddingInput) => Promise<void>;
  },
): Promise<void> {
  const expectedRecord = toPerceptionRecord(session.userId, event);
  // Enrichment is deliberately out of the serialized ingress lane. Re-read the
  // current projection before provider I/O so a late permitted retry after
  // redaction, deletion, or expiry never sends stale text to the embedder.
  const candidate = await deps.loadEmbeddingCandidate(expectedRecord);
  if (!candidate) return;
  const vector = await deps.embedder.embed(perceptionRecordEmbeddingText(candidate));
  if (!vector) return;
  await deps.storeEmbedding({
    modelId: deps.embedder.modelId,
    vector,
    expectedRecord: candidate,
  });
}
