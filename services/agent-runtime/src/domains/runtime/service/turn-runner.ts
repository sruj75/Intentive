import { randomUUID } from "node:crypto";

import type { ConversationRepo } from "../../conversation/types/conversation.js";
import type { DeliveryPort } from "../../delivery/types/delivery.js";
import type { RuntimeIngressEvent } from "../../sessions/types/event.js";
import type { RuntimeTurnsRepo } from "../repo/runtime-turns.js";
import type { TransactionalSql } from "../repo/sql.js";
import type { BoundSession } from "../../sessions/types/event.js";
import type { DeepAgentsAdapter, RuntimeTurnRecord, Turn, TurnRunner } from "../types/turn.js";
import { createTurn } from "./turn.js";
import { createWorkingContext, type WorkingContext } from "./working-context.js";

interface TurnRunnerParams {
  readonly sql: Pick<TransactionalSql, "transaction">;
  readonly adapter: Pick<DeepAgentsAdapter, "invoke">;
  readonly conversation: Pick<ConversationRepo, "appendQuery">;
  readonly runtimeTurns: RuntimeTurnsRepo;
  readonly fallbackModel: string;
  readonly deliveryPort?: DeliveryPort;
  readonly turn?: Turn;
  readonly workingContext?: WorkingContext;
  readonly readUserProfile?: (userId: string) => Promise<string>;
  readonly readRecentPerception?: (userId: string) => Promise<string | null>;
  readonly newMessageId?: () => string;
}

export function createTurnRunner(params: TurnRunnerParams): TurnRunner {
  const newMessageId = params.newMessageId ?? randomUUID;
  const runExecution =
    params.turn ??
    createTurn({
      sql: params.sql,
      adapter: params.adapter,
      workingContext:
        params.workingContext ??
        createWorkingContext({
          readUserProfile: params.readUserProfile ?? (async () => ""),
          readRecentPerception: params.readRecentPerception,
        }),
    });

  return async (session: BoundSession, event: RuntimeIngressEvent): Promise<void> => {
    if (event.type !== "user_message") {
      return;
    }

    const threadId = session.userId;
    const messageId = newMessageId();
    let replyToDeliver: string | null = null;
    await runExecution({
      userId: session.userId,
      threadId,
      body: event.body,
      trigger: "user_message",
      floor: session.pinnedFloor,
      onSuccess: (output) => {
        replyToDeliver = output.reply;
        return [
          params.conversation.appendQuery({
            userId: session.userId,
            messageId,
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
        ];
      },
      onFailure: (error) => ({
        queries: [
          params.runtimeTurns.recordQuery(
            failedTurnRecord(session.userId, threadId, params.fallbackModel, error),
          ),
        ],
        rethrow: true,
      }),
    });
    if (replyToDeliver !== null && params.deliveryPort) {
      await params.deliveryPort.deliver(
        { userId: session.userId, messageId, body: replyToDeliver },
        "reply",
      );
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
