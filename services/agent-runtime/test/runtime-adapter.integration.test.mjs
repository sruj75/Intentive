import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { AIMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { createDeepAgentsAdapter } from "../dist/index.js";
import { applySql, createBranch, dropBranch, hasNeonBranchCreds } from "./helpers/neon-branch.mjs";

const skip = !hasNeonBranchCreds();

let branchId;
let connectionUri;

before(async () => {
  if (skip) return;
  const branch = await createBranch();
  branchId = branch.branchId;
  connectionUri = branch.connectionUri;
  await applySql(connectionUri, "CREATE SCHEMA IF NOT EXISTS agent_runtime;");
});

after(async () => {
  await dropBranch(branchId);
});

test(
  "DeepAgents adapter rehydrates a user thread from the Postgres checkpoint",
  { skip },
  async () => {
    const threadId = randomUUID();
    const firstModel = new RecordingChatModel(["Nice to meet you, Alice."]);
    const firstAdapter = createDeepAgentsAdapter({
      connectionUri,
      model: firstModel,
      modelName: "test-model",
      systemPrompt: "You are the Intentive Companion. Reply briefly.",
    });
    await firstAdapter.setup();

    await firstAdapter.invoke({ threadId, body: "my name is Alice" });

    const secondModel = new RecordingChatModel(["I remember your name is Alice."]);
    const secondAdapter = createDeepAgentsAdapter({
      connectionUri,
      model: secondModel,
      modelName: "test-model",
      systemPrompt: "You are the Intentive Companion. Reply briefly.",
    });
    await secondAdapter.setup();

    await secondAdapter.invoke({ threadId, body: "what is my name?" });

    const secondCallText = secondModel.calls.at(-1).map((message) => String(message.content));
    assert.equal(
      secondCallText.some((content) => content.includes("my name is Alice")),
      true,
    );
    assert.equal(
      secondCallText.some((content) => content.includes("Nice to meet you, Alice.")),
      true,
    );
  },
);

class RecordingChatModel extends BaseChatModel {
  calls = [];
  #replies;

  constructor(replies) {
    super({});
    this.#replies = [...replies];
  }

  _llmType() {
    return "recording-chat-model";
  }

  bindTools() {
    return this;
  }

  async _generate(messages) {
    this.calls.push(messages);
    const content = this.#replies.shift() ?? "";
    return {
      generations: [
        {
          text: content,
          message: new AIMessage({ content }),
        },
      ],
    };
  }
}
