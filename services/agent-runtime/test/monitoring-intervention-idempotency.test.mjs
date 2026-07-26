import assert from "node:assert/strict";
import test from "node:test";

import {
  createCoachingPostMessageBack,
  createCoachingPostMessageBackTool,
  createConnectionRegistry,
  createRecentCoachingEvidenceReader,
  createTurn,
} from "../dist/index.js";

const userId = "00000000-0000-4000-8000-000000000001";
const windowId = "11111111-1111-4111-8111-111111111111";
const context = {
  windowId,
  evidenceVersion: `${windowId}:4-8`,
  evidenceCursorStart: 4,
  evidenceCursorEnd: 8,
};

test("retry after a post-send turn failure reuses the visible intervention and advances only on success", async () => {
  const messageIds = [];
  const transactions = [];
  let canonicalBody;
  const postMessageBack = createCoachingPostMessageBack({
    connections: alwaysActiveConnections,
    conversation: {
      appendCanonical: async (entry) => {
        canonicalBody ??= entry.body;
        return canonicalBody;
      },
    },
    deliveryPort: {
      deliverCoachingProactive: async (message) => {
        messageIds.push(message.messageId);
        return true;
      },
    },
    authorize: async () => true,
  });
  let attempts = 0;
  const turn = createTurn({
    sql: { transaction: async (queries) => transactions.push(queries) },
    runtimeTurns: { recordQuery: (record) => `turn:${record.status}` },
    fallbackModel: "fallback-model",
    workingContext: async (input) => ({
      userId: input.userId,
      threadId: input.threadId,
      body: input.body,
      trigger: input.trigger,
      pinnedFloor: input.floor,
      userProfile: "",
      windowId: input.windowId,
      evidenceVersion: input.evidenceVersion,
      evidenceCursorStart: input.evidenceCursorStart,
      evidenceCursorEnd: input.evidenceCursorEnd,
    }),
    adapter: {
      invoke: async (input) => {
        await postMessageBack(input.userId, "A concise observation.", {
          windowId: input.windowId,
          evidenceVersion: input.evidenceVersion,
          evidenceCursorStart: input.evidenceCursorStart,
          evidenceCursorEnd: input.evidenceCursorEnd,
        });
        attempts += 1;
        if (attempts === 1) {
          throw new Error("provider failed after post-message-back");
        }
        return {
          reply: "",
          traceId: "trace_retry",
          model: "model",
          bundleVersion: "floor_v1",
        };
      },
    },
  });
  const execution = {
    userId,
    threadId: userId,
    body: "monitor",
    trigger: "perception_event",
    ...context,
    floor: async () => floor(),
    beforeCommit: async () => true,
    onSuccess: () => ["advance:8"],
    onFailure: () => ({ queries: ["attempt"], rethrow: false }),
  };

  assert.equal(await turn(execution), null);
  assert.deepEqual(transactions[0], ["attempt", "turn:failed"]);

  assert.notEqual(await turn(execution), null);
  assert.deepEqual(transactions[1], ["advance:8", "turn:ok"]);

  assert.equal(messageIds.length, 2);
  assert.equal(messageIds[1], messageIds[0]);
});

test("a redaction re-emit at the same cursor cannot redeliver a stale canonical intervention", async () => {
  const secret = "OCR_SECRET_SHOULD_NOT_BE_REDELIVERED";
  const originalEvidence = await createRecentCoachingEvidenceReader(
    scriptedSql([[{ upper_cursor: "8" }], [evidenceRow({ summary: secret, ocrText: secret })]]),
  ).read({ userId, windowId, afterCursor: 3 });
  const redactedEvidence = await createRecentCoachingEvidenceReader(
    scriptedSql([
      [{ upper_cursor: "8" }],
      [
        evidenceRow({
          summary: "Sensitive content was redacted.",
          ocrText: null,
          contentRedacted: true,
        }),
      ],
    ]),
  ).read({ userId, windowId, afterCursor: 3 });

  const canonical = new Map();
  const delivered = [];
  let deliveryAttempt = 0;
  const postMessageBack = createCoachingPostMessageBack({
    connections: alwaysActiveConnections,
    conversation: {
      appendCanonical: async (entry) => {
        const existing = canonical.get(entry.messageId);
        if (existing !== undefined) {
          return existing;
        }
        canonical.set(entry.messageId, entry.body);
        return entry.body;
      },
    },
    deliveryPort: {
      deliverCoachingProactive: async (message) => {
        delivered.push(message);
        deliveryAttempt += 1;
        return deliveryAttempt > 1;
      },
    },
    authorize: async () => true,
  });

  await assert.rejects(
    postMessageBack(userId, `Observation derived from ${secret}`, {
      windowId,
      evidenceVersion: originalEvidence.version,
      evidenceCursorStart: originalEvidence.cursorStart,
      evidenceCursorEnd: originalEvidence.cursorEnd,
    }),
  );
  await postMessageBack(userId, "The sensitive detail is no longer available.", {
    windowId,
    evidenceVersion: redactedEvidence.version,
    evidenceCursorStart: redactedEvidence.cursorStart,
    evidenceCursorEnd: redactedEvidence.cursorEnd,
  });

  assert.notEqual(originalEvidence.version, redactedEvidence.version);
  assert.notEqual(delivered[0].messageId, delivered[1].messageId);
  assert.doesNotMatch(delivered[1].body, new RegExp(secret));
});

test("redaction during model work suppresses stale intervention persistence, delivery, and cursor advance", async () => {
  const secret = "OCR_SECRET_MODEL_ALREADY_READ";
  let currentRows = [evidenceRow({ summary: "Working in the editor.", ocrText: secret })];
  const evidenceReader = createRecentCoachingEvidenceReader((strings) => {
    const statement = strings.join("?");
    if (/max\(event\.ingest_seq\)/i.test(statement)) {
      return Promise.resolve([{ upper_cursor: "8" }]);
    }
    return Promise.resolve(currentRows);
  });
  const evidence = await evidenceReader.read({ userId, windowId, afterCursor: 3 });
  const entries = [];
  const deliveries = [];
  const transactions = [];
  let cursorAdvanced = false;
  const postMessageBack = createCoachingPostMessageBack({
    connections: alwaysActiveConnections,
    conversation: {
      appendCanonical: async (entry) => {
        entries.push(entry);
        return entry.body;
      },
    },
    deliveryPort: {
      deliverCoachingProactive: async (message) => {
        deliveries.push(message);
        return true;
      },
    },
    authorize: async (candidateUserId, candidate) =>
      evidenceReader.isCurrent({
        userId: candidateUserId,
        windowId: candidate.windowId,
        cursorStart: candidate.evidenceCursorStart,
        cursorEnd: candidate.evidenceCursorEnd,
        version: candidate.evidenceVersion,
      }),
  });
  let releaseModel;
  const modelGate = new Promise((resolve) => {
    releaseModel = resolve;
  });
  let modelStarted;
  const started = new Promise((resolve) => {
    modelStarted = resolve;
  });
  const turn = createTurn({
    sql: { transaction: async (queries) => transactions.push(queries) },
    runtimeTurns: { recordQuery: (record) => `turn:${record.status}` },
    fallbackModel: "fallback-model",
    workingContext: async (input) => ({
      userId: input.userId,
      threadId: input.threadId,
      body: input.body,
      trigger: input.trigger,
      pinnedFloor: input.floor,
      userProfile: "",
      recentPerception: input.recentPerception,
      windowId: input.windowId,
      evidenceVersion: input.evidenceVersion,
      evidenceCursorStart: input.evidenceCursorStart,
      evidenceCursorEnd: input.evidenceCursorEnd,
    }),
    adapter: {
      invoke: async (input) => {
        modelStarted(input.recentPerception);
        await modelGate;
        const tool = createCoachingPostMessageBackTool({
          postMessageBack,
          userId: input.userId,
          windowId: input.windowId,
          evidenceVersion: input.evidenceVersion,
          evidenceCursorStart: input.evidenceCursorStart,
          evidenceCursorEnd: input.evidenceCursorEnd,
          effects: input.effects,
        });
        try {
          await tool.invoke({ body: `Observation derived from ${secret}` });
        } catch {
          // DeepAgents converts the tool failure to a ToolMessage and continues;
          // the effect guard must still fail the shell turn.
        }
        return {
          reply: "",
          traceId: "trace_stale_evidence",
          model: "model",
          bundleVersion: "floor_v1",
        };
      },
    },
  });
  const turnPromise = turn({
    userId,
    threadId: userId,
    body: "monitor",
    trigger: "perception_event",
    windowId,
    recentPerception: evidence.rendered,
    evidenceVersion: evidence.version,
    evidenceCursorStart: evidence.cursorStart,
    evidenceCursorEnd: evidence.cursorEnd,
    floor: async () => floor(),
    beforeCommit: () =>
      evidenceReader.isCurrent({
        userId,
        windowId,
        cursorStart: evidence.cursorStart,
        cursorEnd: evidence.cursorEnd,
        version: evidence.version,
      }),
    onSuccess: () => {
      cursorAdvanced = true;
      return ["advance:8"];
    },
    onFailure: () => ({ queries: ["attempt"], rethrow: false }),
  });

  assert.match(await started, new RegExp(secret));
  currentRows = [
    evidenceRow({
      summary: "Sensitive content was redacted.",
      ocrText: null,
      contentRedacted: true,
    }),
  ];
  releaseModel();

  assert.equal(await turnPromise, null);
  assert.deepEqual(entries, []);
  assert.deepEqual(deliveries, []);
  assert.equal(cursorAdvanced, false);
  assert.deepEqual(transactions, [["attempt", "turn:failed"]]);
});

for (const scenario of [
  {
    name: "locked",
    deactivate: (handle) =>
      handle.setCoachingPresence(windowId, "locked", "2026-07-26T08:00:02.000Z"),
  },
  {
    name: "disconnected",
    deactivate: (handle) => handle.unregister(),
  },
]) {
  test(`Desktop ${scenario.name} during model work suppresses intervention persistence, delivery, and cursor advance`, async () => {
    const registry = createConnectionRegistry();
    const handle = registry.register(coachingSession(), { send: () => {} });
    handle.setCoachingPresence(windowId, "active", "2026-07-26T08:00:01.000Z");
    assert.equal(registry.hasActiveCoachingWindow(userId, windowId), true);

    const entries = [];
    const deliveries = [];
    const transactions = [];
    let authorizationChecks = 0;
    let cursorAdvanced = false;
    const postMessageBack = createCoachingPostMessageBack({
      connections: registry,
      conversation: {
        appendCanonical: async (entry) => {
          entries.push(entry);
          return entry.body;
        },
      },
      deliveryPort: {
        deliverCoachingProactive: async (message) => {
          deliveries.push(message);
          return true;
        },
      },
      authorize: async () => {
        authorizationChecks += 1;
        return true;
      },
    });
    let releaseModel;
    const modelGate = new Promise((resolve) => {
      releaseModel = resolve;
    });
    let markModelStarted;
    const modelStarted = new Promise((resolve) => {
      markModelStarted = resolve;
    });
    const turn = createTurn({
      sql: { transaction: async (queries) => transactions.push(queries) },
      runtimeTurns: { recordQuery: (record) => `turn:${record.status}` },
      fallbackModel: "fallback-model",
      workingContext: async (input) => ({
        userId: input.userId,
        threadId: input.threadId,
        body: input.body,
        trigger: input.trigger,
        pinnedFloor: input.floor,
        userProfile: "",
        recentPerception: input.recentPerception,
        windowId: input.windowId,
        evidenceVersion: input.evidenceVersion,
        evidenceCursorStart: input.evidenceCursorStart,
        evidenceCursorEnd: input.evidenceCursorEnd,
      }),
      adapter: {
        invoke: async (input) => {
          markModelStarted();
          await modelGate;
          const tool = createCoachingPostMessageBackTool({
            postMessageBack,
            userId: input.userId,
            windowId: input.windowId,
            evidenceVersion: input.evidenceVersion,
            evidenceCursorStart: input.evidenceCursorStart,
            evidenceCursorEnd: input.evidenceCursorEnd,
            effects: input.effects,
          });
          try {
            await tool.invoke({ body: "A stale intervention." });
          } catch {
            // DeepAgents turns tool failures into ToolMessages. The effect
            // guard must still fail the shell turn.
          }
          return {
            reply: "",
            traceId: `trace_${scenario.name}`,
            model: "model",
            bundleVersion: "floor_v1",
          };
        },
      },
    });
    const turnPromise = turn({
      userId,
      threadId: userId,
      body: "monitor",
      trigger: "perception_event",
      windowId,
      recentPerception: "bounded evidence",
      ...context,
      floor: async () => floor(),
      beforeCommit: async () => true,
      onSuccess: () => {
        cursorAdvanced = true;
        return ["advance:8"];
      },
      onFailure: () => ({ queries: ["attempt"], rethrow: false }),
    });

    await modelStarted;
    scenario.deactivate(handle);
    assert.equal(registry.hasActiveCoachingWindow(userId, windowId), false);
    releaseModel();

    assert.equal(await turnPromise, null);
    assert.equal(authorizationChecks, 1);
    assert.deepEqual(entries, []);
    assert.deepEqual(deliveries, []);
    assert.equal(cursorAdvanced, false);
    assert.deepEqual(transactions, [["attempt", "turn:failed"]]);
  });
}

function scriptedSql(results) {
  return () => Promise.resolve(results.shift() ?? []);
}

function evidenceRow({ summary, ocrText, contentRedacted = false }) {
  return {
    ingest_seq: "8",
    event_id: "event-8",
    artifact_type: "searchable_screen_record",
    captured_at: "2026-07-26T08:00:00.000Z",
    period_start: "2026-07-26T07:59:00.000Z",
    period_end: "2026-07-26T08:00:00.000Z",
    summary,
    app_name: "Code",
    window_title: "plan.md",
    ocr_text: ocrText,
    signals: {},
    content_redacted: contentRedacted,
    sensitivity_label: contentRedacted ? "secret_detected" : "normal",
    confidence: 0.9,
  };
}

function floor() {
  return {
    version: "floor_v1",
    documents: {
      SOUL: "soul",
      AGENTS: "agents",
      BOOTSTRAP: "bootstrap",
      HEARTBEAT: "heartbeat",
    },
    langfusePrompts: [],
  };
}

function coachingSession() {
  return {
    userId,
    clientKind: "desktop",
    agentInstanceId: "agent_instance_1",
    pinnedFloor: floor(),
    capabilities: ["desktop_coaching_v1"],
  };
}

const alwaysActiveConnections = {
  hasActiveCoachingWindow: () => true,
};
