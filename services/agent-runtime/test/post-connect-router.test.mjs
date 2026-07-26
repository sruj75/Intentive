import assert from "node:assert/strict";
import test from "node:test";

import {
  createConnectionRegistry,
  createMonitoringCoordinator,
  createPostConnectRouter,
} from "../dist/index.js";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  clientKind: "mobile",
  agentInstanceId: "agent_instance_1",
  pinnedFloor: {
    version: "floor_v1",
    documents: {
      SOUL: "soul",
      AGENTS: "agents",
      BOOTSTRAP: "bootstrap",
      HEARTBEAT: "heartbeat",
    },
    langfusePrompts: [],
  },
  capabilities: [],
};
const coachingSession = {
  ...session,
  clientKind: "desktop",
  capabilities: ["desktop_coaching_v1"],
};

test("a History Backfill request is a read: it calls the channel reader and returns a snapshot response", async () => {
  let acceptCalls = 0;
  const readArgs = [];
  const snapshot = { messages: [], before_cursor: "3" };

  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        acceptCalls += 1;
      },
      readSnapshot: async (...args) => {
        readArgs.push(args);
        return snapshot;
      },
    },
  });

  const response = await route(session, {
    type: "history_backfill_request",
    before_cursor: "53",
    limit: 25,
  });
  const desktopResponse = await route(coachingSession, {
    type: "history_backfill_request",
    before_cursor: "53",
    limit: 25,
  });

  // The request never touches the write path.
  assert.equal(acceptCalls, 0);
  // It reads the older page for this User with the given cursor and limit.
  assert.deepEqual(readArgs, [
    [session.userId, "53", 25, "ordinary"],
    [session.userId, "53", 25, "desktop"],
  ]);
  // And replies with the snapshot wrapped in a backfill response frame.
  assert.deepEqual(response, {
    type: "history_backfill_response",
    session_snapshot: snapshot,
  });
  assert.deepEqual(desktopResponse, response);
});

test("a History Backfill read failure returns the history-unavailable error and never writes", async () => {
  let acceptCalls = 0;

  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        acceptCalls += 1;
      },
      readSnapshot: async () => {
        throw new Error("conversation reader unavailable");
      },
    },
  });

  const response = await route(session, {
    type: "history_backfill_request",
    before_cursor: "53",
  });

  assert.equal(acceptCalls, 0);
  assert.deepEqual(response, {
    type: "runtime_error",
    code: "service_unavailable",
    message: "Conversation history is temporarily unavailable.",
  });
});

test("a state-mutating event is accepted by the channel and produces no direct reply", async () => {
  let readCalls = 0;
  const accepted = [];

  const route = createPostConnectRouter({
    channel: {
      accept: async (s, event) => {
        accepted.push([s, event]);
      },
      readSnapshot: async () => {
        readCalls += 1;
        return { messages: [], before_cursor: null };
      },
    },
  });

  const userMessage = {
    type: "user_message",
    message_id: "m1",
    body: "hello",
    sent_at: "2026-06-10T00:00:00.000Z",
  };
  const response = await route(session, userMessage);

  // The write path owns it; the read path is untouched; nothing is sent straight back.
  assert.equal(readCalls, 0);
  assert.deepEqual(accepted, [[session, userMessage]]);
  assert.equal(response, undefined);
});

test("user messages cannot claim Runtime-owned proactive identities", async () => {
  let acceptCalls = 0;
  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        acceptCalls += 1;
      },
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
  });

  for (const messageId of [
    "opening:11111111-1111-4111-8111-111111111111",
    "intervention:11111111-1111-4111-8111-111111111111:42",
  ]) {
    assert.deepEqual(
      await route(session, {
        type: "user_message",
        message_id: messageId,
        body: "user-authored collision",
        sent_at: "2026-06-10T00:00:00.000Z",
      }),
      {
        type: "runtime_error",
        code: "invalid_connect",
        message: "User messages cannot use Runtime-owned message IDs.",
      },
    );
  }

  assert.equal(acceptCalls, 0);
});

test("durable ingress is acknowledged with its stable id after the channel commits", async () => {
  const accepted = [];
  const route = createPostConnectRouter({
    channel: {
      accept: async (s, event) => {
        accepted.push(event.type);
      },
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
  });

  const perceptionEvent = {
    type: "perception_event",
    event_id: "0b8c6d2e-1f4a-4c3b-9a7d-2e5f6a7b8c9d",
    source_client: "mobile",
    captured_at: "2026-06-10T00:00:00.000Z",
    period_start: "2026-06-09T23:59:00.000Z",
    period_end: "2026-06-10T00:00:00.000Z",
    artifact_type: "activity_summary",
    summary: "s",
    signals: {},
    sensitivity_label: "normal",
    retention_class: "screen_memory_30d",
    confidence: 0.9,
    expires_at: "2026-07-10T00:00:00.000Z",
    local_record_ref: "7c4d9f10-3a2b-4e5c-8d6f-1a2b3c4d5e6f",
  };
  assert.deepEqual(await route(session, perceptionEvent), {
    type: "runtime_ingress_ack",
    ingress_kind: "perception_event",
    ingress_id: "0b8c6d2e-1f4a-4c3b-9a7d-2e5f6a7b8c9d",
  });

  const tombstone = {
    type: "perception_tombstone",
    tombstone_id: "5f9a1b2c-3d4e-4f5a-9b8c-7d6e5f4a3b2c",
    reason: "manual_delete",
    event_refs: ["0b8c6d2e-1f4a-4c3b-9a7d-2e5f6a7b8c9d"],
    emitted_at: "2026-06-10T00:01:00.000Z",
  };
  assert.deepEqual(await route(session, tombstone), {
    type: "runtime_ingress_ack",
    ingress_kind: "perception_tombstone",
    ingress_id: "5f9a1b2c-3d4e-4f5a-9b8c-7d6e5f4a3b2c",
  });

  const marker = {
    type: "session_end_marker",
    marker_id: "3e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b",
    session_id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    ended_at: "2026-06-10T00:02:00.000Z",
    reason: "quit",
  };
  assert.deepEqual(await route(session, marker), {
    type: "runtime_ingress_ack",
    ingress_kind: "session_end_marker",
    ingress_id: "3e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b",
  });

  const windowId = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(
    await route(coachingSession, {
      type: "coaching_window_started",
      window_id: windowId,
      started_at: "2026-06-10T00:03:00.000Z",
      reason: "app_launch",
    }),
    {
      type: "runtime_ingress_ack",
      ingress_kind: "coaching_window_started",
      ingress_id: windowId,
    },
  );
  assert.deepEqual(
    await route(coachingSession, {
      type: "coaching_window_ended",
      window_id: windowId,
      ended_at: "2026-06-10T00:04:00.000Z",
      reason: "pause",
    }),
    {
      type: "runtime_ingress_ack",
      ingress_kind: "coaching_window_ended",
      ingress_id: windowId,
    },
  );

  assert.deepEqual(accepted, [
    "perception_event",
    "perception_tombstone",
    "session_end_marker",
    "coaching_window_started",
    "coaching_window_ended",
  ]);
});

test("a failed channel commit rejects and is never acknowledged", async () => {
  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        throw new Error("transaction failed");
      },
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
  });

  await assert.rejects(
    () =>
      route(session, {
        type: "session_end_marker",
        marker_id: "3e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b",
        session_id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
        ended_at: "2026-06-10T00:02:00.000Z",
        reason: "quit",
      }),
    /transaction failed/,
  );
});

test("presence_update updates the connection foreground state and produces no direct reply", async () => {
  let acceptCalls = 0;
  let readCalls = 0;
  const foreground = [];

  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        acceptCalls += 1;
      },
      readSnapshot: async () => {
        readCalls += 1;
        return { messages: [], before_cursor: null };
      },
    },
  });

  const response = await route(session, { type: "presence_update", foreground: true });

  assert.equal(acceptCalls, 0);
  assert.equal(readCalls, 0);
  assert.deepEqual(foreground, []);
  assert.equal(response, undefined);

  await route(
    session,
    { type: "presence_update", foreground: false },
    {
      setForeground: (value) => foreground.push(value),
      unregister: () => {},
    },
  );
  assert.deepEqual(foreground, [false]);
});

test("Coaching Window presence updates only live connection state and never enters the ledger", async () => {
  let acceptCalls = 0;
  const coachingPresence = [];
  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        acceptCalls += 1;
      },
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
  });
  const event = {
    type: "coaching_window_presence",
    window_id: "11111111-1111-4111-8111-111111111111",
    state: "active",
    changed_at: "2026-07-26T08:00:00.000Z",
  };

  assert.equal(
    await route(coachingSession, event, {
      setForeground: () => {},
      setCoachingPresence: (windowId, state, changedAt) => {
        coachingPresence.push([windowId, state, changedAt]);
        return true;
      },
      unregister: () => {},
    }),
    undefined,
  );
  assert.equal(acceptCalls, 0);
  assert.deepEqual(coachingPresence, [[event.window_id, "active", event.changed_at]]);
});

test("locked Coaching Window presence fails closed globally before notifying the coordinator", async () => {
  const order = [];
  const event = {
    type: "coaching_window_presence",
    window_id: "11111111-1111-4111-8111-111111111111",
    state: "locked",
    changed_at: "2026-07-26T08:00:00.000Z",
  };
  const route = createPostConnectRouter({
    channel: {
      accept: async () => assert.fail("presence must not enter the durable channel"),
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
    onCoachingPresence: async () => {
      order.push("coordinator:notified");
    },
  });

  assert.equal(
    await route(coachingSession, event, {
      setForeground: () => {},
      setCoachingPresence: (windowId, state, changedAt) => {
        order.push(`live:${state}:${windowId}:${changedAt}`);
        return true;
      },
      clearCoachingPresence: () => {},
      unregister: () => {},
    }),
    undefined,
  );
  assert.deepEqual(order, [
    `live:locked:${event.window_id}:${event.changed_at}`,
    "coordinator:notified",
  ]);
});

test("delayed active presence cannot reopen a locked window or notify its coordinator", async () => {
  const notifications = [];
  const registry = createConnectionRegistry();
  const first = registry.register(coachingSession, { send: () => {} });
  const second = registry.register(coachingSession, { send: () => {} });
  const route = createPostConnectRouter({
    channel: {
      accept: async () => assert.fail("presence must not enter the durable channel"),
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
    coachingConnections: registry,
    onCoachingPresence: async (_session, event) => {
      notifications.push([event.state, event.changed_at]);
    },
  });
  const windowId = "11111111-1111-4111-8111-111111111111";

  await route(coachingSession, presence(windowId, "active", "2026-07-26T08:00:00.000Z"), first);
  await route(coachingSession, presence(windowId, "active", "2026-07-26T08:00:01.000Z"), second);
  await route(coachingSession, presence(windowId, "locked", "2026-07-26T08:00:02.000Z"), second);
  assert.equal(registry.hasActiveCoachingWindow(coachingSession.userId, windowId), false);

  await route(coachingSession, presence(windowId, "active", "2026-07-26T08:00:01.500Z"), first);
  assert.equal(registry.hasActiveCoachingWindow(coachingSession.userId, windowId), false);

  await route(coachingSession, presence(windowId, "active", "2026-07-26T08:00:03.000Z"), first);
  assert.equal(registry.hasActiveCoachingWindow(coachingSession.userId, windowId), true);
  assert.deepEqual(notifications, [
    ["active", "2026-07-26T08:00:00.000Z"],
    ["active", "2026-07-26T08:00:01.000Z"],
    ["locked", "2026-07-26T08:00:02.000Z"],
    ["active", "2026-07-26T08:00:03.000Z"],
  ]);
});

test("durable admission rejects stale window A before it can replace active window B", async () => {
  const registry = createConnectionRegistry();
  const handle = registry.register(coachingSession, { send: () => {} });
  const activeWindowId = "22222222-2222-4222-8222-222222222222";
  const staleWindowId = "11111111-1111-4111-8111-111111111111";
  handle.setCoachingPresence(activeWindowId, "active", "2026-07-26T08:00:01.000Z");
  const route = createPostConnectRouter({
    channel: {
      accept: async () => assert.fail("presence must not enter the durable channel"),
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
    coachingConnections: registry,
    onCoachingPresence: async (_session, event) => ({
      accepted: event.window_id === activeWindowId,
    }),
  });

  await route(
    coachingSession,
    presence(staleWindowId, "active", "2026-07-26T08:00:02.000Z"),
    handle,
  );

  assert.equal(registry.hasActiveCoachingWindow(coachingSession.userId, activeWindowId), true);
  assert.equal(registry.hasActiveCoachingWindow(coachingSession.userId, staleWindowId), false);
});

test("active-before-start admission still applies live state before its convergence hook", async () => {
  const registry = createConnectionRegistry();
  const handle = registry.register(coachingSession, { send: () => {} });
  const afterApply = [];
  const candidateWindowId = "11111111-1111-4111-8111-111111111111";
  const route = createPostConnectRouter({
    channel: {
      accept: async () => assert.fail("presence must not enter the durable channel"),
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
    coachingConnections: registry,
    onCoachingPresence: async () => ({
      accepted: true,
      afterApply: () => {
        afterApply.push(
          registry.hasActiveCoachingWindow(coachingSession.userId, candidateWindowId),
        );
      },
    }),
  });

  await route(
    coachingSession,
    presence(candidateWindowId, "active", "2026-07-26T08:00:01.000Z"),
    handle,
  );

  assert.equal(registry.hasActiveCoachingWindow(coachingSession.userId, candidateWindowId), true);
  assert.deepEqual(afterApply, [true]);
});

test("an older locked frame fails closed and a terminal Window End blocks delayed resurrection", async () => {
  const registry = createConnectionRegistry();
  const handle = registry.register(coachingSession, { send: () => {} });
  const candidateWindowId = "11111111-1111-4111-8111-111111111111";
  const route = createPostConnectRouter({
    channel: {
      accept: async () => {},
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
    coachingConnections: registry,
    onCoachingPresence: async () => ({ accepted: true }),
  });

  await route(
    coachingSession,
    presence(candidateWindowId, "active", "2026-07-26T08:00:02.000Z"),
    handle,
  );
  await route(
    coachingSession,
    presence(candidateWindowId, "locked", "2026-07-26T08:00:01.000Z"),
    handle,
  );
  assert.equal(registry.hasActiveCoachingWindow(coachingSession.userId, candidateWindowId), false);

  await route(coachingSession, {
    type: "coaching_window_ended",
    window_id: candidateWindowId,
    ended_at: "2026-07-26T08:00:03.000Z",
    reason: "pause",
  });
  await route(
    coachingSession,
    presence(candidateWindowId, "active", "2026-07-26T08:00:02.500Z"),
    handle,
  );
  assert.equal(registry.hasActiveCoachingWindow(coachingSession.userId, candidateWindowId), false);
});

test("a later lock invalidates an active admission already waiting on durable isActive", async () => {
  const registry = createConnectionRegistry();
  const handle = registry.register(coachingSession, { send: () => {} });
  const candidateWindowId = "11111111-1111-4111-8111-111111111111";
  handle.setCoachingPresence(candidateWindowId, "active", "2026-07-26T08:00:00.000Z");
  const activeLookup = deferred();
  let activeLookups = 0;
  const coordinator = createMonitoringCoordinator({
    gate: { isEnabled: () => true },
    windows: {
      acknowledgeOpening: async () => null,
      readMonitoringState: async () => null,
      isActive: async () => {
        activeLookups += 1;
        return activeLookup.promise;
      },
      advanceEvidenceQuery: () => "advance",
      recordJudgmentAttemptQuery: () => "attempt",
    },
    evidence: { read: async () => null },
    connections: registry,
    channel: {
      enqueueCommitted: async (_userId, run) => run(),
      enqueueBestEffort: () => true,
    },
    opening: { run: async () => true },
    monitoringTurn: async () => true,
    scheduler: { schedule: () => {}, cancel: () => {} },
  });
  const route = createPostConnectRouter({
    channel: {
      accept: async () => assert.fail("presence must not enter the durable channel"),
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
    coachingConnections: registry,
    onCoachingPresence: (boundSession, event) => coordinator.onPresence(boundSession, event),
  });

  const activeRouting = route(
    coachingSession,
    presence(candidateWindowId, "active", "2026-07-26T08:00:10.000Z"),
    handle,
  );
  assert.equal(activeLookups, 1);

  const lockedRouting = route(
    coachingSession,
    presence(candidateWindowId, "locked", "2026-07-26T08:00:05.000Z"),
    handle,
  );
  assert.equal(activeLookups, 2);
  assert.equal(registry.hasActiveCoachingWindow(coachingSession.userId, candidateWindowId), false);

  activeLookup.resolve(true);
  await Promise.all([activeRouting, lockedRouting]);

  assert.equal(registry.hasActiveCoachingWindow(coachingSession.userId, candidateWindowId), false);
});

test("coaching lifecycle and presence reject mobile or legacy Desktop sockets", async () => {
  const accepted = [];
  const coachingPresence = [];
  const route = createPostConnectRouter({
    channel: {
      accept: async (_session, event) => accepted.push(event),
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
  });
  const windowId = "11111111-1111-4111-8111-111111111111";
  const started = {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: "2026-07-26T08:00:00.000Z",
    reason: "app_launch",
  };
  const presence = {
    type: "coaching_window_presence",
    window_id: windowId,
    state: "active",
    changed_at: "2026-07-26T08:00:00.000Z",
  };
  const connection = {
    setForeground: () => {},
    setCoachingPresence: (...args) => coachingPresence.push(args),
    clearCoachingPresence: (...args) => coachingPresence.push(args),
    unregister: () => {},
  };

  for (const ineligible of [session, { ...session, clientKind: "desktop", capabilities: [] }]) {
    assert.deepEqual(await route(ineligible, started, connection), {
      type: "runtime_error",
      code: "invalid_connect",
      message: "Desktop coaching events require the desktop_coaching_v1 capability.",
    });
    assert.deepEqual(await route(ineligible, presence, connection), {
      type: "runtime_error",
      code: "invalid_connect",
      message: "Desktop coaching events require the desktop_coaching_v1 capability.",
    });
  }

  assert.deepEqual(accepted, []);
  assert.deepEqual(coachingPresence, []);
});

test("window-bound perception requires a matching coaching-capable Desktop socket", async () => {
  const accepted = [];
  const route = createPostConnectRouter({
    channel: {
      accept: async (_session, event) => accepted.push(event),
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
  });
  const base = {
    type: "perception_event",
    event_id: "0b8c6d2e-1f4a-4c3b-9a7d-2e5f6a7b8c9d",
    captured_at: "2026-06-10T00:00:00.000Z",
    period_start: "2026-06-09T23:59:00.000Z",
    period_end: "2026-06-10T00:00:00.000Z",
    artifact_type: "activity_summary",
    summary: "s",
    signals: {},
    sensitivity_label: "normal",
    retention_class: "screen_memory_30d",
    confidence: 0.9,
    expires_at: "2026-07-10T00:00:00.000Z",
    local_record_ref: "7c4d9f10-3a2b-4e5c-8d6f-1a2b3c4d5e6f",
  };
  const mobileWindow = {
    ...base,
    source_client: "mobile",
    window_id: "11111111-1111-4111-8111-111111111111",
  };
  assert.deepEqual(await route(session, mobileWindow), {
    type: "runtime_error",
    code: "invalid_connect",
    message: "Window-bound perception requires the desktop_coaching_v1 capability.",
  });

  const legacyDesktop = { ...session, clientKind: "desktop", capabilities: [] };
  assert.deepEqual(await route(legacyDesktop, { ...mobileWindow, source_client: "desktop" }), {
    type: "runtime_error",
    code: "invalid_connect",
    message: "Window-bound perception requires the desktop_coaching_v1 capability.",
  });

  const legacyWindowless = {
    ...base,
    source_client: "mobile",
    event_id: "22222222-2222-4222-8222-222222222222",
  };
  assert.deepEqual(await route(session, legacyWindowless), {
    type: "runtime_ingress_ack",
    ingress_kind: "perception_event",
    ingress_id: legacyWindowless.event_id,
  });

  const previewWindowless = {
    ...base,
    source_client: "desktop",
    event_id: "33333333-3333-4333-8333-333333333333",
  };
  assert.deepEqual(await route(coachingSession, previewWindowless), {
    type: "runtime_ingress_ack",
    ingress_kind: "perception_event",
    ingress_id: previewWindowless.event_id,
  });

  const legacyDesktopWindowless = {
    ...previewWindowless,
    event_id: "44444444-4444-4444-8444-444444444444",
  };
  assert.deepEqual(await route(legacyDesktop, legacyDesktopWindowless), {
    type: "runtime_ingress_ack",
    ingress_kind: "perception_event",
    ingress_id: legacyDesktopWindowless.event_id,
  });
  assert.deepEqual(accepted, [legacyWindowless, previewWindowless, legacyDesktopWindowless]);
});

test("perception source_client must match the authenticated bound client", async () => {
  let acceptCalls = 0;
  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        acceptCalls += 1;
      },
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
  });

  const response = await route(session, {
    type: "perception_event",
    event_id: "0b8c6d2e-1f4a-4c3b-9a7d-2e5f6a7b8c9d",
    source_client: "desktop",
    captured_at: "2026-06-10T00:00:00.000Z",
    period_start: "2026-06-09T23:59:00.000Z",
    period_end: "2026-06-10T00:00:00.000Z",
    artifact_type: "activity_summary",
    summary: "s",
    signals: {},
    sensitivity_label: "normal",
    retention_class: "screen_memory_30d",
    confidence: 0.9,
    expires_at: "2026-07-10T00:00:00.000Z",
    local_record_ref: "7c4d9f10-3a2b-4e5c-8d6f-1a2b3c4d5e6f",
  });

  assert.deepEqual(response, {
    type: "runtime_error",
    code: "invalid_connect",
    message: "Perception source_client must match the authenticated client.",
  });
  assert.equal(acceptCalls, 0);
});

test("Window End clears live attestation before awaiting its durable commit", async () => {
  const order = [];
  let releaseCommit;
  const commit = new Promise((resolve) => {
    releaseCommit = resolve;
  });
  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        order.push("commit:start");
        await commit;
        order.push("commit:end");
      },
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
    coachingConnections: {
      clearCoachingWindow: (userId, windowId) => order.push(`live:cleared:${userId}:${windowId}`),
    },
  });
  const routed = route(
    coachingSession,
    {
      type: "coaching_window_ended",
      window_id: "11111111-1111-4111-8111-111111111111",
      ended_at: "2026-07-26T08:02:00.000Z",
      reason: "pause",
    },
    {
      setForeground: () => {},
      setCoachingPresence: () => {},
      clearCoachingPresence: () => assert.fail("must clear every socket via registry"),
      unregister: () => {},
    },
  );
  await Promise.resolve();
  assert.deepEqual(order, [
    `live:cleared:${coachingSession.userId}:11111111-1111-4111-8111-111111111111`,
    "commit:start",
  ]);
  releaseCommit();
  await routed;
});

test("a capability-bearing Desktop routes only a stable Opening Orientation acknowledgement", async () => {
  const acknowledgements = [];
  const route = createPostConnectRouter({
    channel: {
      accept: async () => {},
      readSnapshot: async () => ({ messages: [], before_cursor: null }),
    },
    onCoachingDeliveryAck: async (...args) => {
      acknowledgements.push(args);
    },
  });
  const openingMessageId = "opening:11111111-1111-4111-8111-111111111111";

  assert.equal(
    await route(coachingSession, {
      type: "delivery_ack",
      message_id: openingMessageId,
    }),
    undefined,
  );
  assert.deepEqual(acknowledgements, [[coachingSession, openingMessageId]]);

  assert.equal(
    await route(coachingSession, { type: "delivery_ack", message_id: "ordinary-message" }),
    undefined,
  );
  assert.equal(
    await route(session, { type: "delivery_ack", message_id: openingMessageId }),
    undefined,
  );
  assert.equal(acknowledgements.length, 1);
});

test("ordinary delivery_ack remains a no-op and unknown events are rejected explicitly", async () => {
  let acceptCalls = 0;
  let readCalls = 0;

  const route = createPostConnectRouter({
    channel: {
      accept: async () => {
        acceptCalls += 1;
      },
      readSnapshot: async () => {
        readCalls += 1;
        return { messages: [], before_cursor: null };
      },
    },
  });

  assert.equal(await route(session, { type: "delivery_ack", message_id: "m1" }), undefined);

  const response = await route(session, { type: "unknown_event" });

  assert.equal(acceptCalls, 0);
  assert.equal(readCalls, 0);
  assert.deepEqual(response, {
    type: "runtime_error",
    code: "invalid_connect",
    message: "Event type is not supported on an active connection.",
  });
});

function presence(windowId, state, changedAt) {
  return {
    type: "coaching_window_presence",
    window_id: windowId,
    state,
    changed_at: changedAt,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
