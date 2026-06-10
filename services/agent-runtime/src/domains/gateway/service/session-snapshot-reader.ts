import type { SessionSnapshotReader } from "./connect.js";

export interface UserTaskQueue {
  submit<T>(userId: string, task: () => Promise<T> | T): Promise<T>;
}

/**
 * Reads Conversation History through the same per-User ordering boundary as
 * writes, without making the gateway depend on the sessions domain's concrete
 * queue implementation.
 */
export function createQueuedSessionSnapshotReader(deps: {
  conversation: SessionSnapshotReader;
  queue: UserTaskQueue;
}): SessionSnapshotReader {
  return {
    readSnapshot(userId, before, limit) {
      return deps.queue.submit(userId, () => deps.conversation.readSnapshot(userId, before, limit));
    },
  };
}
