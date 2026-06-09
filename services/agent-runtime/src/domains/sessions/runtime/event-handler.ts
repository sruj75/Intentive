import type { IngestEvent } from "../service/ingest-event.js";
import type { BoundSession, RuntimeIngressEvent } from "../types/event.js";
import type { UserQueue } from "./user-queue.js";

export type RuntimeIngressHandler = (
  session: BoundSession,
  event: RuntimeIngressEvent,
) => Promise<void> | void;

export function createRuntimeIngressHandler(deps: {
  ingest: IngestEvent;
  queue: UserQueue;
}): RuntimeIngressHandler {
  return async (session, event) => {
    const recorded = await deps.ingest.recordIfNew(session, event);
    if (!recorded) {
      return;
    }

    return deps.queue.submit(session.userId, () => deps.ingest.process(recorded));
  };
}
