import { tool, type StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

import type { PostMessageBack } from "../types/delivery.js";

const PostMessageBackInput = z
  .object({
    body: z.string().min(1),
  })
  .strict();

export function createPostMessageBackTool(params: {
  readonly postMessageBack: PostMessageBack;
  readonly userId: string;
}): StructuredTool {
  return tool(
    async ({ body }) => {
      const result = await params.postMessageBack(params.userId, body);
      return `Post-Message-Back persisted as ${result.messageId}.`;
    },
    {
      name: "post_message_back",
      description:
        "Deliberately interrupt the user with a Companion message. Provide only the message body.",
      schema: PostMessageBackInput,
    },
  );
}
