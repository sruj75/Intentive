import assert from "node:assert/strict";
import test from "node:test";

import { createMonitoringCoordinator } from "../dist/index.js";

const userId = "00000000-0000-4000-8000-000000000001";
const windowId = "11111111-1111-4111-8111-111111111111";
const startedAt = new Date("2026-07-26T08:00:00.000Z");
const orientationCompletedAt = new Date("2026-07-26T08:00:00.000Z");

test("lifecycle and live presence schedule, orient, lock, and end one matching window", async () => {
  const scheduled = [];
  const cancelled = [];
  const openings = [];
  const queue = immediateChannel();
  let activelyAttested = false;
  const coordinator = createCoordinator({
    channel: queue.channel,
    connections: { hasActiveCoachingWindow: () => activelyAttested },
    scheduler: {
      schedule: (id, dueAt) => scheduled.push([id, dueAt]),
      cancel: (id) => cancelled.push(id),
    },
    opening: {
      run: async (...args) => {
        openings.push(args);
        return true;
      },
    },
  });

  coordinator.onLifecycle(session(), {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: startedAt.toISOString(),
    reason: "app_launch",
  });
  activelyAttested = true;
  await applyPresence(coordinator, session(), {
    type: "coaching_window_presence",
    window_id: windowId,
    state: "active",
    changed_at: startedAt.toISOString(),
  });
  await queue.drain();
  await applyPresence(coordinator, session(), {
    type: "coaching_window_presence",
    window_id: windowId,
    state: "locked",
    changed_at: "2026-07-26T08:01:00.000Z",
  });
  coordinator.onLifecycle(session(), {
    type: "coaching_window_ended",
    window_id: windowId,
    ended_at: "2026-07-26T08:02:00.000Z",
    reason: "pause",
  });

  assert.deepEqual(openings, [[userId, windowId, pinnedFloor("floor_v1")]]);
  assert.equal(scheduled[0][1].toISOString(), "2026-07-26T08:02:00.000Z");
  assert.deepEqual(cancelled, [userId, userId, userId]);
});

test("Desktop acknowledgement completes the matching opening in committed order before monitoring is scheduled", async () => {
  const scheduled = [];
  const acknowledgements = [];
  const queue = immediateChannel();
  const coordinator = createCoordinator({
    channel: queue.channel,
    windows: {
      ...windows(),
      acknowledgeOpening: async (...args) => {
        acknowledgements.push(args);
        return {
          userId,
          windowId,
          startedAt,
          orientationCompletedAt,
          evidenceCursor: null,
          evidenceVersion: null,
          lastMonitoringTurnAt: null,
        };
      },
    },
    scheduler: {
      schedule: (id, dueAt) => scheduled.push([id, dueAt]),
      cancel: () => {},
    },
  });

  await coordinator.onDeliveryAck(session(), `opening:${windowId}`);
  await queue.drain();

  assert.deepEqual(acknowledgements, [[userId, `opening:${windowId}`]]);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0][0], userId);
  assert.equal(scheduled[0][1].toISOString(), "2026-07-26T08:02:00.000Z");
});

test("Window Start and active presence do not schedule monitoring before opening acknowledgement", async () => {
  const scheduled = [];
  const queue = immediateChannel();
  let activelyAttested = false;
  const coordinator = createCoordinator({
    channel: queue.channel,
    connections: { hasActiveCoachingWindow: () => activelyAttested },
    windows: {
      ...windows(),
      readMonitoringState: async () => null,
    },
    scheduler: {
      schedule: (id, dueAt) => scheduled.push([id, dueAt]),
      cancel: () => {},
    },
  });

  coordinator.onLifecycle(session(), {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: startedAt.toISOString(),
    reason: "app_launch",
  });
  activelyAttested = true;
  await applyPresence(coordinator, session(), {
    type: "coaching_window_presence",
    window_id: windowId,
    state: "active",
    changed_at: startedAt.toISOString(),
  });
  await queue.drain();

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0][1].toISOString(), "2026-07-26T08:00:01.000Z");
});

test("an unscoped opening acknowledgement cannot start monitoring", async () => {
  const scheduled = [];
  const queue = immediateChannel();
  const coordinator = createCoordinator({
    channel: queue.channel,
    windows: {
      ...windows(),
      acknowledgeOpening: async () => null,
    },
    scheduler: {
      schedule: (id, dueAt) => scheduled.push([id, dueAt]),
      cancel: () => {},
    },
  });

  await coordinator.onDeliveryAck(session(), `opening:${windowId}`);
  await queue.drain();

  assert.deepEqual(scheduled, []);
});

test("the 120-second floor defers model judgment and unchanged evidence stays silent", async () => {
  const scheduled = [];
  let evidenceReads = 0;
  let modelCalls = 0;
  const queue = immediateChannel();
  const coordinator = createCoordinator({
    channel: queue.channel,
    clock: () => new Date("2026-07-26T08:01:00.000Z"),
    scheduler: {
      schedule: (id, dueAt) => scheduled.push([id, dueAt]),
      cancel: () => {},
    },
    evidence: {
      read: async () => {
        evidenceReads += 1;
        return null;
      },
    },
    monitoringTurn: async () => {
      modelCalls += 1;
      return true;
    },
  });

  startWindow(coordinator);
  coordinator.onHeartbeat(userId);
  await queue.drain();

  assert.equal(evidenceReads, 0);
  assert.equal(modelCalls, 0);
  assert.equal(scheduled[0][1].toISOString(), "2026-07-26T08:02:00.000Z");

  const due = createCoordinator({
    channel: queue.channel,
    clock: () => new Date("2026-07-26T08:02:00.000Z"),
    scheduler: {
      schedule: (id, dueAt) => scheduled.push([id, dueAt]),
      cancel: () => {},
    },
    evidence: {
      read: async () => {
        evidenceReads += 1;
        return null;
      },
    },
    monitoringTurn: async () => {
      modelCalls += 1;
      return true;
    },
  });
  startWindow(due);
  due.onHeartbeat(userId);
  await queue.drain();
  assert.equal(evidenceReads, 1);
  assert.equal(modelCalls, 0);
});

test("the first judgment floor uses server orientation completion despite future or delayed client starts", async () => {
  for (const clientStartedAt of [
    new Date("2099-01-01T00:00:00.000Z"),
    new Date("2026-07-20T00:00:00.000Z"),
  ]) {
    const scheduled = [];
    let evidenceReads = 0;
    const queue = immediateChannel();
    const coordinator = createCoordinator({
      channel: queue.channel,
      clock: () => new Date("2026-07-26T08:01:00.000Z"),
      windows: {
        ...windows(),
        readMonitoringState: async () => ({
          userId,
          windowId,
          startedAt: clientStartedAt,
          orientationCompletedAt,
          evidenceCursor: null,
          evidenceVersion: null,
          lastMonitoringTurnAt: null,
        }),
      },
      scheduler: {
        schedule: (_id, dueAt) => scheduled.push(dueAt),
        cancel: () => {},
      },
      evidence: {
        read: async () => {
          evidenceReads += 1;
          return null;
        },
      },
    });

    startWindow(coordinator);
    coordinator.onHeartbeat(userId);
    await queue.drain();

    assert.equal(evidenceReads, 0);
    assert.equal(scheduled[0].toISOString(), "2026-07-26T08:02:00.000Z");
  }
});

test("due evidence runs one matching-window turn and advances only its included cursor", async () => {
  const queue = immediateChannel();
  const advances = [];
  const contexts = [];
  const currentChecks = [];
  const evidence = {
    windowId,
    cursorStart: 5,
    cursorEnd: 9,
    version: "evidence_v9",
    eventIds: ["e6", "e9"],
    oldestCapturedAt: new Date("2026-07-26T08:01:30.000Z"),
    rendered: "bounded evidence",
  };
  const coordinator = createCoordinator({
    channel: queue.channel,
    clock: () => new Date("2026-07-26T08:02:00.000Z"),
    windows: {
      ...windows(),
      advanceEvidenceQuery: (input) => (advances.push(input), "advance-query"),
    },
    evidence: {
      read: async () => evidence,
      isCurrent: async (input) => {
        currentChecks.push(input);
        return true;
      },
    },
    monitoringTurn: async (_id, _trigger, context) => {
      contexts.push(context);
      assert.equal(context.floor.version, "floor_v1");
      assert.equal(await context.beforeCommit(), true);
      assert.deepEqual(context.onSuccessQueries(), ["advance-query"]);
      assert.deepEqual(context.onFailureQueries(), ["attempt-query"]);
      return true;
    },
  });

  startWindow(coordinator);
  coordinator.onPerception(session(), {
    type: "perception_event",
    window_id: windowId,
  });
  await queue.drain();

  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].evidence, evidence);
  assert.deepEqual(currentChecks, [
    {
      userId,
      windowId,
      cursorStart: 5,
      cursorEnd: 9,
      version: "evidence_v9",
    },
  ]);
  assert.equal(advances[0].cursorEnd, 9);
  assert.equal(advances[0].evidenceVersion, "evidence_v9");
});

test("coaching work uses the connection-pinned floor and only changes it on reconnect attestation", async () => {
  const queue = immediateChannel();
  const openingFloors = [];
  const monitoringFloors = [];
  const coordinator = createCoordinator({
    channel: queue.channel,
    clock: () => new Date("2026-07-26T08:02:00.000Z"),
    opening: {
      run: async (_userId, _windowId, floor) => {
        openingFloors.push(floor.version);
        return true;
      },
    },
    evidence: {
      read: async () => ({
        windowId,
        cursorStart: 1,
        cursorEnd: 1,
        version: "evidence_v1",
        eventIds: ["e1"],
        oldestCapturedAt: new Date("2026-07-26T08:01:30.000Z"),
        rendered: "bounded evidence",
      }),
    },
    monitoringTurn: async (_id, _trigger, context) => {
      monitoringFloors.push(context.floor.version);
      return true;
    },
  });

  await applyPresence(coordinator, session("floor_v1"), {
    type: "coaching_window_presence",
    window_id: windowId,
    state: "active",
    changed_at: startedAt.toISOString(),
  });
  await queue.drain();
  coordinator.onHeartbeat(userId);
  await queue.drain();

  await applyPresence(coordinator, session("floor_v2"), {
    type: "coaching_window_presence",
    window_id: windowId,
    state: "active",
    changed_at: "2026-07-26T08:03:00.000Z",
  });
  await queue.drain();
  coordinator.onHeartbeat(userId);
  await queue.drain();

  assert.deepEqual(openingFloors, ["floor_v1", "floor_v2"]);
  assert.deepEqual(monitoringFloors, ["floor_v1", "floor_v2"]);
});

test("late perception and end from a superseded window cannot cancel or poison the active window", async () => {
  const staleWindowId = "22222222-2222-4222-8222-222222222222";
  const queue = immediateChannel();
  const cancelled = [];
  const floors = [];
  const coordinator = createCoordinator({
    channel: queue.channel,
    clock: () => new Date("2026-07-26T08:02:00.000Z"),
    scheduler: {
      schedule: () => {},
      cancel: (id) => cancelled.push(id),
    },
    evidence: {
      read: async () => ({
        windowId,
        cursorStart: 1,
        cursorEnd: 1,
        version: "evidence_v1",
        eventIds: ["e1"],
        oldestCapturedAt: new Date("2026-07-26T08:01:30.000Z"),
        rendered: "bounded evidence",
      }),
    },
    monitoringTurn: async (_id, _trigger, context) => {
      floors.push(context.floor.version);
      return true;
    },
  });

  coordinator.onLifecycle(session("stale_floor"), {
    type: "coaching_window_started",
    window_id: staleWindowId,
    started_at: "2026-07-26T07:59:00.000Z",
    reason: "app_launch",
  });
  coordinator.onLifecycle(session("active_floor"), {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: startedAt.toISOString(),
    reason: "system_wake",
  });
  const cancellationsBeforeLateEnd = cancelled.length;

  coordinator.onPerception(session("stale_floor"), {
    type: "perception_event",
    window_id: staleWindowId,
  });
  await queue.drain();
  coordinator.onLifecycle(session("stale_floor"), {
    type: "coaching_window_ended",
    window_id: staleWindowId,
    ended_at: "2026-07-26T08:01:00.000Z",
    reason: "system_sleep",
  });
  assert.equal(cancelled.length, cancellationsBeforeLateEnd);

  coordinator.onHeartbeat(userId);
  await queue.drain();
  assert.deepEqual(floors, ["active_floor"]);
});

test("late locked or active presence from a superseded window cannot disturb the active window", async () => {
  const staleWindowId = "22222222-2222-4222-8222-222222222222";
  const queue = immediateChannel();
  const cancelled = [];
  const openings = [];
  const monitoringFloors = [];
  const coordinator = createCoordinator({
    channel: queue.channel,
    clock: () => new Date("2026-07-26T08:02:00.000Z"),
    windows: {
      ...windows(),
      isActive: async (_userId, candidateWindowId) => candidateWindowId === windowId,
    },
    connections: {
      hasActiveCoachingWindow: (_userId, candidateWindowId) => candidateWindowId === windowId,
    },
    scheduler: {
      schedule: () => {},
      cancel: (id) => cancelled.push(id),
    },
    opening: {
      run: async (_userId, candidateWindowId) => {
        openings.push(candidateWindowId);
        return true;
      },
    },
    evidence: {
      read: async () => ({
        windowId,
        cursorStart: 1,
        cursorEnd: 1,
        version: "evidence_v1",
        eventIds: ["e1"],
        oldestCapturedAt: new Date("2026-07-26T08:01:30.000Z"),
        rendered: "bounded evidence",
      }),
    },
    monitoringTurn: async (_id, _trigger, context) => {
      monitoringFloors.push(context.floor.version);
      return true;
    },
  });

  coordinator.onLifecycle(session("active_floor"), {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: startedAt.toISOString(),
    reason: "app_launch",
  });
  const cancellationsBeforeStalePresence = cancelled.length;

  const lockedAdmission = await coordinator.onPresence(session("stale_floor"), {
    type: "coaching_window_presence",
    window_id: staleWindowId,
    state: "locked",
    changed_at: "2026-07-26T08:01:00.000Z",
  });
  await lockedAdmission.afterApply?.();
  const activeAdmission = await coordinator.onPresence(session("stale_floor"), {
    type: "coaching_window_presence",
    window_id: staleWindowId,
    state: "active",
    changed_at: "2026-07-26T08:01:01.000Z",
  });
  await queue.drain();
  coordinator.onHeartbeat(userId);
  await queue.drain();

  assert.equal(cancelled.length, cancellationsBeforeStalePresence);
  assert.equal(openings.includes(staleWindowId), false);
  assert.deepEqual(monitoringFloors, ["active_floor"]);
  assert.equal(lockedAdmission.accepted, true);
  assert.equal(activeAdmission.accepted, false);
});

test("active presence arriving before durable Window Start still runs the opening after Start commits", async () => {
  const queue = immediateChannel();
  let durableStartCommitted = false;
  const deliveredOpenings = [];
  const coordinator = createCoordinator({
    channel: queue.channel,
    windows: {
      ...windows(),
      isActive: async () => durableStartCommitted,
      readMonitoringState: async () => null,
    },
    connections: { hasActiveCoachingWindow: () => true },
    opening: {
      run: async (_userId, candidateWindowId) => {
        if (durableStartCommitted) {
          deliveredOpenings.push(candidateWindowId);
          return true;
        }
        return false;
      },
    },
  });

  const admission = await coordinator.onPresence(session(), {
    type: "coaching_window_presence",
    window_id: windowId,
    state: "active",
    changed_at: "2026-07-26T07:59:59.000Z",
  });
  assert.equal(admission.accepted, true);
  await queue.drain();
  assert.deepEqual(deliveredOpenings, []);

  durableStartCommitted = true;
  coordinator.onLifecycle(session(), {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: startedAt.toISOString(),
    reason: "app_launch",
  });
  await queue.drain();

  assert.deepEqual(deliveredOpenings, [windowId]);
});

test("pending and ready openings retry automatically with capped backoff until Desktop acknowledges", async () => {
  const queue = immediateChannel();
  const scheduled = [];
  let now = new Date("2026-07-26T08:00:00.000Z");
  let openingAttempts = 0;
  let acknowledged = false;
  const monitoringState = {
    userId,
    windowId,
    startedAt,
    orientationCompletedAt,
    evidenceCursor: null,
    evidenceVersion: null,
    lastMonitoringTurnAt: null,
  };
  const coordinator = createCoordinator({
    channel: queue.channel,
    clock: () => now,
    openingRetryBaseMs: 1_000,
    openingRetryMaxMs: 4_000,
    windows: {
      ...windows(),
      readMonitoringState: async () => (acknowledged ? monitoringState : null),
      acknowledgeOpening: async () => {
        acknowledged = true;
        return monitoringState;
      },
    },
    connections: { hasActiveCoachingWindow: () => true },
    scheduler: {
      schedule: (id, dueAt) => scheduled.push([id, dueAt]),
      cancel: () => {},
    },
    opening: {
      run: async () => {
        openingAttempts += 1;
        return openingAttempts > 1;
      },
    },
  });

  coordinator.onLifecycle(session(), {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: startedAt.toISOString(),
    reason: "app_launch",
  });
  await queue.drain();
  assert.equal(openingAttempts, 1);
  assert.equal(scheduled.at(-1)[1].toISOString(), "2026-07-26T08:00:01.000Z");

  now = new Date("2026-07-26T08:00:01.000Z");
  coordinator.onHeartbeat(userId);
  await queue.drain();
  assert.equal(openingAttempts, 2);
  assert.equal(scheduled.at(-1)[1].toISOString(), "2026-07-26T08:00:03.000Z");

  now = new Date("2026-07-26T08:00:03.000Z");
  coordinator.onHeartbeat(userId);
  await queue.drain();
  assert.equal(openingAttempts, 3);
  assert.equal(scheduled.at(-1)[1].toISOString(), "2026-07-26T08:00:07.000Z");

  await coordinator.onDeliveryAck(session(), `opening:${windowId}`);
  await queue.drain();
  assert.equal(scheduled.at(-1)[1].toISOString(), "2026-07-26T08:02:00.000Z");
});

test("a failed judgment durably floors new evidence for 120 seconds without advancing its cursor", async () => {
  const attempted = [];
  const scheduled = [];
  const state = {
    userId,
    windowId,
    startedAt,
    orientationCompletedAt,
    evidenceCursor: 4,
    evidenceVersion: "evidence_v4",
    lastMonitoringTurnAt: null,
  };
  let evidenceReads = 0;
  let modelCalls = 0;
  const evidence = {
    windowId,
    cursorStart: 5,
    cursorEnd: 9,
    version: "evidence_v9",
    eventIds: ["e5"],
    oldestCapturedAt: new Date("2026-07-26T08:01:30.000Z"),
    rendered: "bounded evidence",
  };
  const repo = {
    readMonitoringState: async () => ({ ...state }),
    isActive: async () => true,
    advanceEvidenceQuery: () => assert.fail("failed turn must not advance cursor"),
    recordJudgmentAttemptQuery: (input) => {
      attempted.push(input);
      state.lastMonitoringTurnAt = input.attemptedAt;
      return "attempt-query";
    },
  };
  const firstQueue = immediateChannel();
  const failed = createCoordinator({
    channel: firstQueue.channel,
    clock: () => new Date("2026-07-26T08:02:00.000Z"),
    windows: repo,
    evidence: {
      read: async () => {
        evidenceReads += 1;
        return evidence;
      },
    },
    monitoringTurn: async (_id, _trigger, context) => {
      modelCalls += 1;
      assert.deepEqual(context.onFailureQueries(), ["attempt-query"]);
      return false;
    },
  });

  startWindow(failed);
  failed.onPerception(session(), { type: "perception_event", window_id: windowId });
  await firstQueue.drain();
  assert.equal(state.evidenceCursor, 4);
  assert.equal(state.evidenceVersion, "evidence_v4");
  assert.equal(attempted[0].attemptedAt.toISOString(), "2026-07-26T08:02:00.000Z");

  // A fresh coordinator models scheduler/process state loss: durable projection
  // alone must enforce the trailing floor.
  const restartQueue = immediateChannel();
  const restarted = createCoordinator({
    channel: restartQueue.channel,
    clock: () => new Date("2026-07-26T08:02:01.000Z"),
    windows: repo,
    scheduler: {
      schedule: (_id, dueAt) => scheduled.push(dueAt),
      cancel: () => {},
    },
    evidence: {
      read: async () => {
        evidenceReads += 1;
        return evidence;
      },
    },
    monitoringTurn: async () => {
      modelCalls += 1;
      return true;
    },
  });
  startWindow(restarted);
  restarted.onPerception(session(), {
    type: "perception_event",
    window_id: windowId,
  });
  await restartQueue.drain();

  assert.equal(evidenceReads, 1);
  assert.equal(modelCalls, 1);
  assert.equal(scheduled.at(-1).toISOString(), "2026-07-26T08:04:00.000Z");
});

test("an unexpected evidence read failure re-arms after 120 seconds without cursor work", async () => {
  const queue = immediateChannel();
  const scheduled = [];
  let cursorCalls = 0;
  let modelCalls = 0;
  const coordinator = createCoordinator({
    channel: queue.channel,
    clock: () => new Date("2026-07-26T08:02:00.000Z"),
    windows: {
      ...windows(),
      advanceEvidenceQuery: () => {
        cursorCalls += 1;
        return "advance";
      },
      recordJudgmentAttemptQuery: () => {
        cursorCalls += 1;
        return "attempt";
      },
    },
    scheduler: {
      schedule: (_id, dueAt) => scheduled.push(dueAt),
      cancel: () => {},
    },
    evidence: { read: async () => Promise.reject(new Error("read unavailable")) },
    monitoringTurn: async () => {
      modelCalls += 1;
      return true;
    },
  });

  startWindow(coordinator);
  coordinator.onHeartbeat(userId);
  await assert.doesNotReject(queue.drain());

  assert.equal(modelCalls, 0);
  assert.equal(cursorCalls, 0);
  assert.equal(scheduled.at(-1).toISOString(), "2026-07-26T08:04:00.000Z");
});

test("an unexpectedly thrown turn also re-arms after 120 seconds", async () => {
  const queue = immediateChannel();
  const scheduled = [];
  const coordinator = createCoordinator({
    channel: queue.channel,
    clock: () => new Date("2026-07-26T08:02:00.000Z"),
    scheduler: {
      schedule: (_id, dueAt) => scheduled.push(dueAt),
      cancel: () => {},
    },
    evidence: {
      read: async () => ({
        windowId,
        cursorStart: 1,
        cursorEnd: 1,
        version: "evidence_v1",
        eventIds: ["e1"],
        oldestCapturedAt: new Date("2026-07-26T08:01:30.000Z"),
        rendered: "bounded evidence",
      }),
    },
    monitoringTurn: async () => Promise.reject(new Error("turn transaction unavailable")),
  });

  startWindow(coordinator);
  coordinator.onHeartbeat(userId);
  await assert.doesNotReject(queue.drain());

  assert.equal(scheduled.at(-1).toISOString(), "2026-07-26T08:04:00.000Z");
});

function createCoordinator(overrides = {}) {
  return createMonitoringCoordinator({
    gate: { isEnabled: () => true },
    windows: windows(),
    evidence: { read: async () => null },
    connections: { hasActiveCoachingWindow: () => true },
    channel: immediateChannel().channel,
    opening: { run: async () => true },
    monitoringTurn: async () => true,
    scheduler: { schedule: () => {}, cancel: () => {} },
    clock: () => new Date("2026-07-26T08:00:00.000Z"),
    ...overrides,
  });
}

function windows() {
  return {
    acknowledgeOpening: async () => null,
    readMonitoringState: async () => ({
      userId,
      windowId,
      startedAt,
      orientationCompletedAt,
      evidenceCursor: null,
      evidenceVersion: null,
      lastMonitoringTurnAt: null,
    }),
    isActive: async () => true,
    advanceEvidenceQuery: () => "advance-query",
    recordJudgmentAttemptQuery: () => "attempt-query",
  };
}

function session(floorVersion = "floor_v1") {
  return {
    userId,
    clientKind: "desktop",
    agentInstanceId: "agent_instance_1",
    pinnedFloor: pinnedFloor(floorVersion),
    capabilities: ["desktop_coaching_v1"],
  };
}

function startWindow(coordinator, floorVersion = "floor_v1") {
  coordinator.onLifecycle(session(floorVersion), {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: startedAt.toISOString(),
    reason: "app_launch",
  });
}

function pinnedFloor(version) {
  return {
    version,
    documents: {
      SOUL: "soul",
      AGENTS: "agents",
      BOOTSTRAP: "bootstrap",
      HEARTBEAT: "heartbeat",
    },
    langfusePrompts: [],
  };
}

function immediateChannel() {
  const pending = [];
  return {
    channel: {
      enqueueCommitted: (_id, run) => {
        const promise = Promise.resolve().then(run);
        pending.push(promise);
        return promise;
      },
      enqueueBestEffort: (_id, run) => {
        pending.push(Promise.resolve().then(run));
        return true;
      },
    },
    drain: async () => {
      while (pending.length > 0) {
        await pending.shift();
      }
    },
  };
}

async function applyPresence(coordinator, boundSession, event) {
  const admission = await coordinator.onPresence(boundSession, event);
  if (admission.accepted) {
    await admission.afterApply?.();
  }
  return admission;
}
