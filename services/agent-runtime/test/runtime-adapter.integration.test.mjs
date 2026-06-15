import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { AIMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { assembleSystemPrompt, createDeepAgentsAdapter } from "../dist/index.js";
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

    await firstAdapter.invoke(turnInput({ threadId, body: "my name is Alice" }));

    const secondModel = new RecordingChatModel(["I remember your name is Alice."]);
    const secondAdapter = createDeepAgentsAdapter({
      connectionUri,
      model: secondModel,
      modelName: "test-model",
      systemPrompt: "You are the Intentive Companion. Reply briefly.",
    });
    await secondAdapter.setup();

    await secondAdapter.invoke(turnInput({ threadId, body: "what is my name?" }));

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

test(
  "DeepAgents adapter assembles the pinned floor and USER.md profile into the model prompt",
  { skip },
  async () => {
    const threadId = randomUUID();
    const model = new RecordingChatModel(["hello"]);
    const adapter = createDeepAgentsAdapter({
      connectionUri,
      model,
      modelName: "test-model",
      assemblePrompt: assembleSystemPrompt,
    });
    await adapter.setup();

    const output = await adapter.invoke(
      turnInput({
        threadId,
        body: "hello",
        userProfile: "prefers concise answers",
        pinnedFloor: floor("floor_v2"),
      }),
    );

    const callText = model.calls.at(-1).map((message) => String(message.content));
    assert.equal(
      callText.some((content) => content.includes("soul floor_v2")),
      true,
    );
    assert.equal(
      callText.some((content) => content.includes("prefers concise answers")),
      true,
    );
    assert.equal(output.bundleVersion, "floor_v2");
    assert.equal(output.traceId, null);
  },
);

test(
  "DeepAgents adapter records each turn's own trace via a per-turn callback handler",
  { skip },
  async () => {
    const threadId = randomUUID();
    const model = new RecordingChatModel(["first reply", "second reply"]);
    const handlers = [];
    const adapter = createDeepAgentsAdapter({
      connectionUri,
      model,
      modelName: "test-model",
      assemblePrompt: assembleSystemPrompt,
      createCallbackHandler: () => {
        const handler = new FakeTracingHandler(`trace_${handlers.length}`);
        handlers.push(handler);
        return handler;
      },
    });
    await adapter.setup();

    const first = await adapter.invoke(turnInput({ threadId, body: "first" }));
    const second = await adapter.invoke(turnInput({ threadId, body: "second" }));

    // A fresh handler per turn, and each turn reports its own handler's trace —
    // never a value left on a process-shared instance by another turn.
    assert.equal(handlers.length, 2);
    assert.equal(first.traceId, "trace_0");
    assert.equal(second.traceId, "trace_1");
    assert.equal(handlers[0].flushed, true);
  },
);

class FakeTracingHandler extends BaseCallbackHandler {
  name = "FakeTracingHandler";
  flushed = false;
  #traceId;

  constructor(traceId) {
    super();
    this.#traceId = traceId;
  }

  getTraceId() {
    return this.#traceId;
  }

  async flushAsync() {
    this.flushed = true;
  }
}

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

function turnInput({ threadId, body, userProfile = "", pinnedFloor = floor("floor_v1") }) {
  return {
    userId: threadId,
    threadId,
    body,
    trigger: "user_message",
    pinnedFloor,
    userProfile,
  };
}

function floor(version) {
  return {
    version,
    documents: {
      SOUL: `soul ${version}`,
      AGENTS: `agents ${version}`,
      BOOTSTRAP: `bootstrap ${version}`,
      HEARTBEAT: `heartbeat ${version}`,
    },
    langfusePrompts: [],
  };
}
