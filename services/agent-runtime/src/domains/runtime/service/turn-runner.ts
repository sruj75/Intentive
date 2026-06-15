import { randomUUID } from "node:crypto";

import type { ConversationRepo } from "../../conversation/types/conversation.js";
import type { RuntimeIngressEvent } from "../../sessions/types/event.js";
import type { RuntimeTurnsRepo } from "../repo/runtime-turns.js";
import type { TransactionalSql } from "../repo/sql.js";
import type { BoundSession } from "../../sessions/types/event.js";
import type { DeepAgentsAdapter, RuntimeTurnRecord, TurnRunner } from "../types/turn.js";

interface TurnRunnerParams {
  readonly sql: Pick<TransactionalSql, "transaction">;
  readonly adapter: Pick<DeepAgentsAdapter, "invoke">;
  readonly conversation: Pick<ConversationRepo, "appendQuery">;
  readonly runtimeTurns: RuntimeTurnsRepo;
  readonly fallbackModel: string;
  readonly readUserProfile?: (userId: string) => Promise<string>;
  readonly newMessageId?: () => string;
}

export function createTurnRunner(params: TurnRunnerParams): TurnRunner {
  const newMessageId = params.newMessageId ?? randomUUID;

  return async (session: BoundSession, event: RuntimeIngressEvent): Promise<void> => {
    if (event.type !== "user_message") {
      return;
    }

    const threadId = session.userId;

    try {
      const userProfile = params.readUserProfile
        ? await params.readUserProfile(session.userId)
        : "";
      const output = await params.adapter.invoke({
        userId: session.userId,
        threadId,
        body: event.body,
        trigger: event.type,
        pinnedFloor: session.pinnedFloor,
        userProfile,
      });
      await params.sql.transaction([
        params.conversation.appendQuery({
          userId: session.userId,
          messageId: newMessageId(),
          author: "companion",
          body: output.reply,
          viaPostMessageBack: false,
        }),
        params.runtimeTurns.recordQuery({
          userId: session.userId,
          threadId,
          traceId: output.traceId,
          model: output.model,
          bundleVersion: output.bundleVersion,
          status: "ok",
          error: null,
        }),
      ]);
    } catch (error) {
      await params.sql.transaction([
        params.runtimeTurns.recordQuery(
          failedTurnRecord(session.userId, threadId, params.fallbackModel, error),
        ),
      ]);
      throw error;
    }
  };
}

function failedTurnRecord(
  userId: string,
  threadId: string,
  model: string,
  error: unknown,
): RuntimeTurnRecord {
  return {
    userId,
    threadId,
    traceId: null,
    model,
    bundleVersion: null,
    status: "failed",
    error: errorMessage(error),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
