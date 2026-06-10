import type { SessionSnapshot } from "@intentive/protocol";

/**
 * One timeline entry to append to Conversation History. Author-agnostic: in #29
 * only `user` entries are written; the companion half is filled by its producer
 * (#36) calling `append` with `author: "companion"`. `seq` and `at` are assigned
 * by the database, never by the caller.
 */
export interface ConversationEntry {
  readonly userId: string;
  readonly messageId: string;
  readonly author: "user" | "companion";
  readonly body: string;
  readonly viaPostMessageBack: boolean;
}

/**
 * The Conversation History store. A deep, two-method interface: `append` writes
 * one entry write-once; `readSnapshot` hides the whole Session Snapshot
 * projection — ordering by the monotonic `seq`, the default-50 window, and
 * `before_cursor` "older history exists" detection. See ADR-0006 / ADR-0008.
 */
export interface ConversationRepo {
  append(entry: ConversationEntry): Promise<void>;

  /**
   * The Session Snapshot projection, oldest-first. With no `before`, returns the
   * newest window; with `before` (a cursor from a prior snapshot) returns the
   * page strictly older than it. `before_cursor` is the `seq` of the oldest row
   * returned, and is non-null only when still-older history exists.
   */
  readSnapshot(userId: string, before?: string, limit?: number): Promise<SessionSnapshot>;
}
