import type { SessionMessage } from "@intentive/protocol";

import type { ConversationEntry, ConversationRepo } from "../types/conversation.js";
import type { Sql } from "./sql.js";

const DEFAULT_LIMIT = 50;

/**
 * A row of `agent_runtime.conversation_messages`. `seq` is a bigint, which the
 * Neon driver returns as a string to avoid precision loss; `at` is a timestamptz
 * the driver returns as a string.
 */
interface ConversationRow {
  readonly seq: string;
  readonly message_id: string;
  readonly author: "user" | "companion";
  readonly body: string;
  readonly at: string;
  readonly via_post_message_back: boolean;
}

export function createConversationRepo(sql: Sql): ConversationRepo {
  return {
    appendQuery(entry: ConversationEntry) {
      // Write-once: a replayed message_id for the same User is silently dropped.
      // `seq` and `at` are assigned by the database.
      return sql`
        INSERT INTO agent_runtime.conversation_messages
          (user_id, message_id, author, body, via_post_message_back)
        VALUES (
          ${entry.userId},
          ${entry.messageId},
          ${entry.author},
          ${entry.body},
          ${entry.viaPostMessageBack}
        )
        ON CONFLICT (user_id, message_id) DO NOTHING
      `;
    },

    async append(entry: ConversationEntry) {
      await this.appendQuery(entry);
    },

    async readSnapshot(userId, before, limit = DEFAULT_LIMIT) {
      // Read newest-first, one row past the window, so the sentinel tells us
      // whether older history exists beyond what we return.
      const rows =
        before === undefined
          ? await sql<ConversationRow>`
              SELECT seq, message_id, author, body, at, via_post_message_back
              FROM agent_runtime.conversation_messages
              WHERE user_id = ${userId}
              ORDER BY seq DESC
              LIMIT ${limit + 1}
            `
          : await sql<ConversationRow>`
              SELECT seq, message_id, author, body, at, via_post_message_back
              FROM agent_runtime.conversation_messages
              WHERE user_id = ${userId} AND seq < ${before}::bigint
              ORDER BY seq DESC
              LIMIT ${limit + 1}
            `;

      const hasOlder = rows.length > limit;
      const windowNewestFirst = hasOlder ? rows.slice(0, limit) : rows;
      const oldestInWindow = windowNewestFirst[windowNewestFirst.length - 1];

      return {
        messages: windowNewestFirst.map(toSessionMessage).reverse(),
        before_cursor: hasOlder && oldestInWindow ? String(oldestInWindow.seq) : null,
      };
    },
  };
}

function toSessionMessage(row: ConversationRow): SessionMessage {
  return {
    message_id: row.message_id,
    author: row.author,
    body: row.body,
    at: new Date(row.at).toISOString(),
    via_post_message_back: row.via_post_message_back,
  };
}
