import type { BoundSession, RuntimeIngressEvent } from "../types/event.js";
import type { UserQueue } from "./user-queue.js";

export type RuntimeIngressHandler = (
  session: BoundSession,
  event: RuntimeIngressEvent,
) => Promise<void> | void;

export function createRuntimeIngressHandler(deps: {
  commit: (session: BoundSession, event: RuntimeIngressEvent) => Promise<void>;
  queue: UserQueue;
}): RuntimeIngressHandler {
  return async (session, event) => {
    return deps.queue.submit(session.userId, () => deps.commit(session, event));
  };
}
