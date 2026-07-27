#!/usr/bin/env node

import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  CoachingEvalError,
  createContentFreeRunEvidence,
  renderFixtureEvidence,
  validateCoachingDataset,
} from "./lib/coaching-eval.mjs";

const serviceRoot = path.resolve(import.meta.dirname, "..");
const defaultDatasetPath = path.join(serviceRoot, "evals", "desktop-performance-coach-v1.json");
const evalUserId = "00000000-0000-4000-8000-000000000001";
const evalWindowId = "11111111-1111-4111-8111-111111111111";

async function main() {
  let options;
  let completedCaseCount = 0;
  try {
    options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(helpText());
      return;
    }
    requireLiveConfiguration(options, process.env);

    const dataset = validateCoachingDataset(
      JSON.parse(await readFile(options.datasetPath, "utf8")),
    );
    const collaborators = await loadLiveCollaborators();
    const langfuse = new collaborators.Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_HOST,
    });
    const floor = await collaborators
      .createProcedureFloorResolver({
        source: collaborators.createLangfuseFloorSource({ client: langfuse }),
      })
      .resolve("production");

    const model = new collaborators.ChatOpenAI({
      model: process.env.RUNTIME_MODEL,
      apiKey: process.env.OPENROUTER_API_KEY,
      temperature: 0,
      configuration: {
        baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      },
    });
    const observations = new Map();
    for (const item of dataset.items) {
      const observation = await runCase({
        collaborators,
        floor,
        item,
        model,
      });
      observations.set(item.id, observation);
      completedCaseCount += 1;
    }

    const evidence = createContentFreeRunEvidence({
      dataset,
      model: process.env.RUNTIME_MODEL,
      observations,
    });
    await writeEvidence(options.evidencePath, evidence);
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    if (!evidence.passed) {
      process.stderr.write(
        `${JSON.stringify({
          error: "behavior_gate_failed",
          message: "One or more synthetic coaching behavior cases failed.",
        })}\n`,
      );
      process.exitCode = 1;
    }
  } catch (error) {
    if (options?.evidencePath && completedCaseCount > 0) {
      await writeEvidence(options.evidencePath, {
        schema_version: 1,
        mode: "provider-live",
        synthetic_content_only: true,
        status: "failed",
        error: "provider_eval_failed",
        completed_case_count: completedCaseCount,
      }).catch(() => {});
    }
    const safe = safeError(error);
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  }
}

async function runCase({ collaborators, floor, item, model }) {
  if (item.id === "user-correction") {
    return runCorrectionSequence({ collaborators, floor, item, model });
  }
  const trigger = runtimeTrigger(item);
  const recentPerception = renderFixtureEvidence(item.input.recent_perception ?? []);
  const systemPrompt = collaborators.assembleSystemPrompt({
    floor,
    trigger,
    recentPerception,
    firstRun: trigger === "opening_orientation",
  });
  const interventions = [];
  const effects = collaborators.createTurnEffectGuard();
  const tools = isDirectReplyCase(item.id)
    ? []
    : [
        collaborators.createCoachingPostMessageBackTool({
          userId: evalUserId,
          windowId: evalWindowId,
          evidenceVersion: `${evalWindowId}:${item.id}`,
          evidenceCursorStart: 1,
          evidenceCursorEnd: Math.max(1, item.input.recent_perception?.length ?? 0),
          effects,
          postMessageBack: async (_userId, body) => {
            interventions.push(body);
            return {
              messageId: `eval:${item.id}:${interventions.length}`,
            };
          },
        }),
      ];

  const agent = collaborators.createDeepAgent({
    model,
    backend: (configuration) => new collaborators.StateBackend(configuration),
    tools,
    systemPrompt,
  });
  const result = await agent.invoke({
    messages: evalMessages(item),
  });
  effects.assertSucceeded();
  return observeResult({
    AIMessage: collaborators.AIMessage,
    interventions,
    result,
  });
}

export async function runCorrectionSequence({ collaborators, floor, item, model }) {
  const checkpointer = new collaborators.MemorySaver();
  const invocationConfig = {
    configurable: { thread_id: `coaching-eval:${item.id}` },
  };
  const correctionAgent = collaborators.createDeepAgent({
    model,
    checkpointer,
    backend: (configuration) => new collaborators.StateBackend(configuration),
    tools: [],
    systemPrompt: collaborators.assembleSystemPrompt({
      floor,
      trigger: "user_message",
      firstRun: false,
    }),
  });
  const correctionResult = await correctionAgent.invoke(
    { messages: evalMessages(item) },
    invocationConfig,
  );
  const correctionObservation = observeResult({
    AIMessage: collaborators.AIMessage,
    interventions: [],
    result: correctionResult,
  });

  const followUp = item.input.follow_up;
  const followUpInterventions = [];
  const effects = collaborators.createTurnEffectGuard();
  const followUpAgent = collaborators.createDeepAgent({
    model,
    checkpointer,
    backend: (configuration) => new collaborators.StateBackend(configuration),
    tools: [
      collaborators.createCoachingPostMessageBackTool({
        userId: evalUserId,
        windowId: evalWindowId,
        evidenceVersion: `${evalWindowId}:${item.id}:follow-up`,
        evidenceCursorStart: 1,
        evidenceCursorEnd: Math.max(1, followUp.recent_perception.length),
        effects,
        postMessageBack: async (_userId, body) => {
          followUpInterventions.push(body);
          return {
            messageId: `eval:${item.id}:follow-up:${followUpInterventions.length}`,
          };
        },
      }),
    ],
    systemPrompt: collaborators.assembleSystemPrompt({
      floor,
      trigger: followUp.trigger,
      recentPerception: renderFixtureEvidence(followUp.recent_perception),
      firstRun: false,
    }),
  });
  const followUpOutcome =
    typeof followUp.important_outcome === "string"
      ? ` The User-chosen Important Outcome is: ${followUp.important_outcome}.`
      : "";
  const followUpResult = await followUpAgent.invoke(
    {
      messages: [
        {
          role: "user",
          content:
            `Run a Monitoring Turn for ${followUp.trigger}. ` +
            `Decide whether to stay silent or call post_message_back.${followUpOutcome}`,
        },
      ],
    },
    invocationConfig,
  );
  effects.assertSucceeded();
  const followUpObservation = observeResult({
    AIMessage: collaborators.AIMessage,
    interventions: followUpInterventions,
    result: followUpResult,
  });

  return {
    directReply: correctionObservation.directReply,
    allModelText: [...correctionObservation.allModelText, ...followUpObservation.allModelText],
    interventions: correctionObservation.interventions,
    followUpInterventions,
    correctionFollowUpCompleted: true,
    memoryWrites: [...correctionObservation.memoryWrites, ...followUpObservation.memoryWrites],
    toolCallNames: [...correctionObservation.toolCallNames, ...followUpObservation.toolCallNames],
    tokenInput: correctionObservation.tokenInput + followUpObservation.tokenInput,
    tokenOutput: correctionObservation.tokenOutput + followUpObservation.tokenOutput,
  };
}

function evalMessages(item) {
  const conversation = Array.isArray(item.input.conversation)
    ? item.input.conversation.map((message) => ({
        role: message.author === "companion" ? "assistant" : "user",
        content: message.body,
      }))
    : [];

  if (item.id === "opening-orientation") {
    return [
      {
        role: "user",
        content:
          "Begin the Opening Orientation. Welcome me naturally and help me choose one Important Outcome.",
      },
    ];
  }
  if (item.id === "user-correction") {
    return conversation;
  }

  const outcome =
    typeof item.input.important_outcome === "string"
      ? ` The User-chosen Important Outcome is: ${item.input.important_outcome}.`
      : "";
  return [
    ...conversation,
    {
      role: "user",
      content: `Run a Monitoring Turn for ${item.input.trigger}. Decide whether to stay silent or call post_message_back.${outcome}`,
    },
  ];
}

function observeResult({ AIMessage, interventions, result }) {
  const messages = Array.isArray(result?.messages) ? result.messages : [];
  const aiMessages = messages.filter((message) => AIMessage.isInstance(message));
  const allModelText = aiMessages.map(messageText).filter(Boolean);
  const toolCalls = aiMessages.flatMap((message) =>
    Array.isArray(message.tool_calls) ? message.tool_calls : [],
  );
  const memoryWrites = [];
  for (const call of toolCalls) {
    if (call?.name === "write_file") {
      pushString(memoryWrites, call.args?.content);
    }
    if (call?.name === "edit_file") {
      pushString(memoryWrites, call.args?.new_string);
    }
  }

  let tokenInput = 0;
  let tokenOutput = 0;
  for (const message of aiMessages) {
    if (typeof message.usage_metadata?.input_tokens === "number") {
      tokenInput += message.usage_metadata.input_tokens;
    }
    if (typeof message.usage_metadata?.output_tokens === "number") {
      tokenOutput += message.usage_metadata.output_tokens;
    }
  }

  return {
    directReply: allModelText.at(-1) ?? "",
    allModelText,
    interventions,
    memoryWrites,
    toolCallNames: toolCalls.map((call) => call?.name).filter((name) => typeof name === "string"),
    tokenInput,
    tokenOutput,
  };
}

function messageText(message) {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((block) =>
        typeof block === "string" ? block : typeof block?.text === "string" ? block.text : "",
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function runtimeTrigger(item) {
  if (item.id === "opening-orientation") {
    return "opening_orientation";
  }
  return item.input.trigger;
}

function isDirectReplyCase(caseId) {
  return caseId === "opening-orientation" || caseId === "user-correction";
}

async function loadLiveCollaborators() {
  const [
    { AIMessage },
    { ChatOpenAI },
    { createDeepAgent, StateBackend },
    { MemorySaver },
    { Langfuse },
    runtime,
  ] = await Promise.all([
    import("@langchain/core/messages"),
    import("@langchain/openai"),
    import("deepagents"),
    import("@langchain/langgraph"),
    import("langfuse-langchain"),
    import("../dist/index.js"),
  ]);
  return {
    AIMessage,
    ChatOpenAI,
    Langfuse,
    MemorySaver,
    StateBackend,
    createDeepAgent,
    assembleSystemPrompt: runtime.assembleSystemPrompt,
    createLangfuseFloorSource: runtime.createLangfuseFloorSource,
    createProcedureFloorResolver: runtime.createProcedureFloorResolver,
    createCoachingPostMessageBackTool: runtime.createCoachingPostMessageBackTool,
    createTurnEffectGuard: runtime.createTurnEffectGuard,
  };
}

function parseArguments(arguments_) {
  const options = {
    datasetPath: defaultDatasetPath,
    evidencePath: null,
    help: false,
    live: false,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--") {
      continue;
    }
    if (argument === "--live") {
      options.live = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--dataset" || argument === "--evidence") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CoachingEvalError("invalid_arguments", `${argument} requires a path.`);
      }
      index += 1;
      const resolved = path.resolve(process.cwd(), value);
      if (argument === "--dataset") {
        options.datasetPath = resolved;
      } else {
        options.evidencePath = resolved;
      }
      continue;
    }
    throw new CoachingEvalError("invalid_arguments", `Unknown argument: ${argument}`);
  }
  return options;
}

function requireLiveConfiguration(options, env) {
  if (!options.live) {
    throw new CoachingEvalError(
      "live_confirmation_required",
      "Pass --live to authorize the synthetic OpenRouter coaching evaluation.",
    );
  }
  if (!options.evidencePath) {
    throw new CoachingEvalError(
      "evidence_path_required",
      "--live requires --evidence PATH for content-free rollout evidence.",
    );
  }
  if (!env.OPENROUTER_API_KEY || !env.RUNTIME_MODEL) {
    throw new CoachingEvalError(
      "openrouter_configuration_missing",
      "--live requires OPENROUTER_API_KEY and an explicit RUNTIME_MODEL.",
    );
  }
  if (
    !env.LANGFUSE_PUBLIC_KEY ||
    !env.LANGFUSE_SECRET_KEY ||
    !(env.LANGFUSE_BASE_URL || env.LANGFUSE_HOST)
  ) {
    throw new CoachingEvalError(
      "langfuse_configuration_missing",
      "--live requires LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL (or LANGFUSE_HOST).",
    );
  }
  try {
    new URL(env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1");
  } catch {
    throw new CoachingEvalError(
      "openrouter_configuration_invalid",
      "OPENROUTER_BASE_URL must be a valid URL.",
    );
  }
}

async function writeEvidence(evidencePath, evidence) {
  const directory = path.dirname(evidencePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${evidencePath}.${process.pid}.tmp`;
  const handle = await open(temporaryPath, "w", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, evidencePath);
}

function safeError(error) {
  if (error instanceof CoachingEvalError) {
    return { error: error.code, message: error.message };
  }
  return {
    error: "provider_eval_failed",
    message: "The synthetic provider-live coaching evaluation did not complete.",
  };
}

function helpText() {
  return [
    "Run the provider-live Desktop coaching behavior gate with synthetic fixtures only.",
    "",
    "Required:",
    "  --live                 Explicitly authorize OpenRouter model calls",
    "  --evidence PATH        Write content-free JSON rollout evidence",
    "  OPENROUTER_API_KEY     OpenRouter credential",
    "  RUNTIME_MODEL          Explicit OpenRouter model identifier",
    "  LANGFUSE_PUBLIC_KEY    Langfuse project public key",
    "  LANGFUSE_SECRET_KEY    Langfuse project secret key",
    "  LANGFUSE_BASE_URL      Langfuse regional origin",
    "",
    "Optional:",
    "  --dataset PATH         Override the checked-in synthetic dataset",
    "  OPENROUTER_BASE_URL    Defaults to https://openrouter.ai/api/v1",
    "",
  ].join("\n");
}

function pushString(values, value) {
  if (typeof value === "string") {
    values.push(value);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
