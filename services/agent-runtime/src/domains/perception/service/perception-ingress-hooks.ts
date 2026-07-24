import type { PerceptionEvent } from "@intentive/protocol";

import type {
  BoundSession,
  PerceptionArrivedSink,
  PerceptionProjectedSink,
} from "../../sessions/types/event.js";
import { embeddingText, toPerceptionRecord } from "../repo/perception-records.js";
import type { PerceptionEmbedder, StorePerceptionEmbeddingInput } from "../types/perception.js";

export interface PerceptionIngressHooks {
  readonly onPerceptionArrived: PerceptionArrivedSink;
  readonly onPerceptionProjected: PerceptionProjectedSink;
}

export function createPerceptionIngressHooks(deps: {
  readonly embedder: PerceptionEmbedder;
  readonly storeEmbedding: (input: StorePerceptionEmbeddingInput) => Promise<void>;
  readonly enqueueMonitoring: (userId: string) => boolean;
  readonly onEmbeddingError: (
    error: unknown,
    context: { readonly userId: string; readonly eventId: string },
  ) => void;
}): PerceptionIngressHooks {
  return {
    onPerceptionArrived(session) {
      deps.enqueueMonitoring(session.userId);
    },

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
    readonly storeEmbedding: (input: StorePerceptionEmbeddingInput) => Promise<void>;
  },
): Promise<void> {
  const vector = await deps.embedder.embed(embeddingText(event));
  if (!vector) return;
  await deps.storeEmbedding({
    modelId: deps.embedder.modelId,
    vector,
    expectedRecord: toPerceptionRecord(session.userId, event),
  });
}
