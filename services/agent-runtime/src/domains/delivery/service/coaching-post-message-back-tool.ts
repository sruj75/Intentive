import { tool, type StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

import type { TurnEffectGuard } from "../../runtime/types/turn.js";
import type { CoachingPostMessageBack } from "../types/delivery.js";

const CoachingPostMessageBackInput = z
  .object({
    body: z.string().trim().min(1),
  })
  .strict();

/**
 * The model sees only `{ body }`. All lifecycle and evidence identity is bound
 * by the Agent Runtime shell, and any failed egress is latched so Turn Execution
 * fails even when DeepAgents converts the thrown tool error into a ToolMessage.
 */
export function createCoachingPostMessageBackTool(params: {
  readonly postMessageBack: CoachingPostMessageBack;
  readonly userId: string;
  readonly windowId: string;
  readonly evidenceVersion: string;
  readonly evidenceCursorStart: number;
  readonly evidenceCursorEnd: number;
  readonly effects: TurnEffectGuard;
}): StructuredTool {
  return tool(
    async ({ body }) => {
      try {
        const result = await params.postMessageBack(params.userId, body, {
          windowId: params.windowId,
          evidenceVersion: params.evidenceVersion,
          evidenceCursorStart: params.evidenceCursorStart,
          evidenceCursorEnd: params.evidenceCursorEnd,
        });
        return `Post-Message-Back persisted as ${result.messageId}.`;
      } catch (error) {
        params.effects.fail(error);
        throw error;
      }
    },
    {
      name: "post_message_back",
      description:
        "Deliberately interrupt the user with a Companion message. Provide only the message body.",
      schema: CoachingPostMessageBackInput,
    },
  );
}
