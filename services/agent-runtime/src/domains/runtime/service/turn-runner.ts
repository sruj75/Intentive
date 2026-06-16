import { randomUUID } from "node:crypto";
import type { Logger } from "@intentive/providers/telemetry";

import type { ConversationRepo } from "../../conversation/types/conversation.js";
import type { DeliveryPort } from "../../delivery/types/delivery.js";
import type { RuntimeIngressEvent } from "../../sessions/types/event.js";
import type { RuntimeTurnsRepo } from "../repo/runtime-turns.js";
import type { TransactionalSql } from "../repo/sql.js";
import type { BoundSession } from "../../sessions/types/event.js";
import type { DeepAgentsAdapter, Turn, TurnRunner } from "../types/turn.js";
import { createTurn } from "./turn.js";
import { createWorkingContext, type WorkingContext } from "./working-context.js";

interface TurnRunnerParams {
  readonly sql: Pick<TransactionalSql, "transaction">;
  readonly adapter: Pick<DeepAgentsAdapter, "invoke">;
  readonly conversation: Pick<ConversationRepo, "appendQuery">;
  // Construction deps for the self-built spine; ignored when `turn` is injected.
  readonly runtimeTurns?: RuntimeTurnsRepo;
  readonly fallbackModel?: string;
  readonly deliveryPort?: DeliveryPort;
  readonly turn?: Turn;
  readonly workingContext?: WorkingContext;
  readonly readUserProfile?: (userId: string) => Promise<string>;
  readonly readRecentPerception?: (userId: string) => Promise<string | null>;
  readonly newMessageId?: () => string;
  readonly logger?: Logger;
}

export function createTurnRunner(params: TurnRunnerParams): TurnRunner {
  const newMessageId = params.newMessageId ?? randomUUID;
  const runExecution = params.turn ?? selfBuiltTurn(params);

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
      floor: () => Promise.resolve(session.pinnedFloor),
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
        ];
      },
      // ADR-0020 containment stays at the channel: rethrow so the failed turn is
      // contained per-trigger, not retried here.
      onFailure: () => ({ queries: [], rethrow: true }),
    });
    if (replyToDeliver !== null && params.deliveryPort) {
      await params.deliveryPort.deliver(
        { userId: session.userId, messageId, body: replyToDeliver },
        "reply",
      );
    }
  };
}

function selfBuiltTurn(params: TurnRunnerParams): Turn {
  if (!params.runtimeTurns || params.fallbackModel === undefined) {
    throw new Error(
      "createTurnRunner needs `runtimeTurns` and `fallbackModel` when no `turn` is injected",
    );
  }
  return createTurn({
    sql: params.sql,
    adapter: params.adapter,
    runtimeTurns: params.runtimeTurns,
    fallbackModel: params.fallbackModel,
    logger: params.logger,
    workingContext:
      params.workingContext ??
      createWorkingContext({
        readUserProfile: params.readUserProfile ?? (async () => ""),
        readRecentPerception: params.readRecentPerception,
      }),
  });
}
