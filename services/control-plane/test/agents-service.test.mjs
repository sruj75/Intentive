/**
 * Agents service logic, fully hermetic: a fake SessionStarter stands in for the
 * Agent Runtime call and a fake repo for the SQL. This tier proves the
 * composition — call the starter, record the instance, return the Runtime's
 * identity — and that the local read reflects the repo, without any I/O.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createAgentsService } from "../dist/domains/agents/service/agents-service.js";
import { AgentRuntimeUnavailableError } from "../dist/domains/agents/types/runtime-errors.js";

/** A fake repo backed by an in-memory set of user ids. */
const fakeRepo = (initial = []) => {
  const provisioned = new Set(initial);
  const recorded = [];
  return {
    recorded,
    provisioned,
    recordInstance: async ({ userId, agentInstanceId }) => {
      recorded.push({ userId, agentInstanceId });
      provisioned.add(userId);
    },
    hasInstance: async (userId) => provisioned.has(userId),
  };
};

const recordingLogger = (records) => ({
  info: (event, attrs) => records.push({ level: "info", event, attrs }),
  warn: (event, attrs) => records.push({ level: "warn", event, attrs }),
  error: (event, error, attrs) => records.push({ level: "error", event, error, attrs }),
  child: () => recordingLogger(records),
});

test("ensureAgentInstance calls the starter, records the instance, returns the AR identity", async () => {
  const starts = [];
  const repo = fakeRepo();
  const service = createAgentsService({
    sessionStarter: {
      startSession: async (input) => {
        starts.push(input);
        return { agentInstanceId: "agent_1", wsUrl: "wss://runtime.example.com/ws" };
      },
    },
    instances: repo,
  });

  const identity = await service.ensureAgentInstance({ userId: "u_1", authSubject: "sub-1" });

  assert.deepEqual(identity, { agentInstanceId: "agent_1", wsUrl: "wss://runtime.example.com/ws" });
  assert.deepEqual(starts, [{ userId: "u_1", authSubject: "sub-1" }]);
  assert.deepEqual(repo.recorded, [{ userId: "u_1", agentInstanceId: "agent_1" }]);
});

test("ensureAgentInstance logs Session Start success", async () => {
  const records = [];
  const service = createAgentsService({
    sessionStarter: {
      startSession: async () => ({
        agentInstanceId: "agent_1",
        wsUrl: "wss://runtime.example.com/ws",
      }),
    },
    instances: fakeRepo(),
    logger: recordingLogger(records),
  });

  await service.ensureAgentInstance({ userId: "u_1", authSubject: "sub-1" });

  assert.equal(records.length, 1);
  assert.equal(records[0].level, "info");
  assert.equal(records[0].event, "session_start.call");
  assert.equal(records[0].attrs.user_id, "u_1");
  assert.equal(records[0].attrs.status, "ok");
  assert.equal(typeof records[0].attrs.duration_ms, "number");
});

test("a second ensureAgentInstance is idempotent and still returns the AR identity", async () => {
  let calls = 0;
  const repo = fakeRepo();
  const service = createAgentsService({
    sessionStarter: {
      // The Runtime's Session Start is itself idempotent: same instance each time.
      startSession: async () => {
        calls += 1;
        return { agentInstanceId: "agent_1", wsUrl: "wss://runtime.example.com/ws" };
      },
    },
    instances: repo,
  });

  await service.ensureAgentInstance({ userId: "u_1", authSubject: "sub-1" });
  const second = await service.ensureAgentInstance({ userId: "u_1", authSubject: "sub-1" });

  assert.equal(calls, 2, "Session Start is called on every entry (ws_url is never cached)");
  assert.deepEqual(second, { agentInstanceId: "agent_1", wsUrl: "wss://runtime.example.com/ws" });
});

test("a Runtime failure propagates and records nothing", async () => {
  const repo = fakeRepo();
  const service = createAgentsService({
    sessionStarter: {
      startSession: async () => {
        throw new AgentRuntimeUnavailableError("non_2xx", "boom");
      },
    },
    instances: repo,
  });

  await assert.rejects(
    () => service.ensureAgentInstance({ userId: "u_1", authSubject: "sub-1" }),
    (err) => err instanceof AgentRuntimeUnavailableError,
  );
  assert.deepEqual(repo.recorded, [], "nothing is recorded when the session never started");
});

test("ensureAgentInstance logs Session Start failure reason", async () => {
  const records = [];
  const service = createAgentsService({
    sessionStarter: {
      startSession: async () => {
        throw new AgentRuntimeUnavailableError("non_2xx", "boom");
      },
    },
    instances: fakeRepo(),
    logger: recordingLogger(records),
  });

  await assert.rejects(
    () => service.ensureAgentInstance({ userId: "u_1", authSubject: "sub-1" }),
    AgentRuntimeUnavailableError,
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].level, "warn");
  assert.equal(records[0].event, "session_start.call");
  assert.equal(records[0].attrs.user_id, "u_1");
  assert.equal(records[0].attrs.status, "failed");
  assert.equal(records[0].attrs.reason, "non_2xx");
});

test("hasAgentInstance reflects the repo", async () => {
  const service = createAgentsService({
    sessionStarter: { startSession: async () => assert.fail("must not call the Runtime") },
    instances: fakeRepo(["u_known"]),
  });

  assert.equal(await service.hasAgentInstance("u_known"), true);
  assert.equal(await service.hasAgentInstance("u_unknown"), false);
});
