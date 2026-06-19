import assert from "node:assert/strict";
import test from "node:test";

import { createNotificationsService } from "../dist/domains/notifications/service/notifications-service.js";

function createHarness({ targets = [], tickets = [], receipts = {} } = {}) {
  const sent = [];
  const recorded = [];
  const checked = [];
  const cleared = [];
  const service = createNotificationsService({
    devices: {
      listExpoPushTargetsForUser: async () => targets,
      clearExpoPushToken: async (deviceId, expoPushToken) => {
        cleared.push({ deviceId, expoPushToken });
      },
    },
    sender: {
      send: async (messages) => {
        sent.push(...messages);
        return tickets;
      },
      getReceipts: async (ticketIds) => {
        checked.push(...ticketIds);
        return receipts;
      },
    },
    tickets: {
      recordTickets: async (rows) => {
        recorded.push(...rows);
      },
      listUnchecked: async () =>
        targets.map((target, index) => ({
          id: `row-${index + 1}`,
          ticketId: `ticket-${index + 1}`,
          deviceId: target.deviceId,
          expoPushToken: target.expoPushToken,
        })),
      markChecked: async (ids) => {
        checked.push(...ids);
      },
    },
  });
  return { service, sent, recorded, checked, cleared };
}

test("pushToUser with no Expo tokens returns delivered false and never sends", async () => {
  const { service, sent, recorded } = createHarness();

  const result = await service.pushToUser({
    userId: "u_1",
    previewText: "hello",
    messageId: "m_1",
  });

  assert.deepEqual(result, { delivered: false, deviceCount: 0 });
  assert.deepEqual(sent, []);
  assert.deepEqual(recorded, []);
});

test("pushToUser sends one Expo message, records the ticket, and reports delivery", async () => {
  const { service, sent, recorded } = createHarness({
    targets: [{ deviceId: "dev_1", expoPushToken: "ExponentPushToken[one]" }],
    tickets: [{ status: "ok", id: "ticket_1" }],
  });

  const result = await service.pushToUser({
    userId: "u_1",
    previewText: "Your Companion has an update.",
    messageId: "message_1",
  });

  assert.deepEqual(result, { delivered: true, deviceCount: 1 });
  assert.deepEqual(sent, [
    {
      to: "ExponentPushToken[one]",
      body: "Your Companion has an update.",
      data: { message_id: "message_1" },
    },
  ]);
  assert.deepEqual(recorded, [
    {
      ticketId: "ticket_1",
      deviceId: "dev_1",
      expoPushToken: "ExponentPushToken[one]",
      messageId: "message_1",
    },
  ]);
});

test("pushToUser counts attempted devices even when only one ticket is accepted", async () => {
  const { service, recorded } = createHarness({
    targets: [
      { deviceId: "dev_1", expoPushToken: "ExponentPushToken[one]" },
      { deviceId: "dev_2", expoPushToken: "ExponentPushToken[two]" },
    ],
    tickets: [
      { status: "ok", id: "ticket_1" },
      { status: "error", token: "ExponentPushToken[two]", error: "MessageTooBig" },
    ],
  });

  const result = await service.pushToUser({
    userId: "u_1",
    previewText: "hello",
    messageId: "m_1",
  });

  assert.deepEqual(result, { delivered: true, deviceCount: 2 });
  assert.deepEqual(
    recorded.map((row) => row.ticketId),
    ["ticket_1"],
  );
});

test("pushToUser clears immediate dead-token errors", async () => {
  const { service, cleared } = createHarness({
    targets: [{ deviceId: "dev_1", expoPushToken: "ExponentPushToken[dead]" }],
    tickets: [
      {
        status: "error",
        token: "ExponentPushToken[dead]",
        error: "DeviceNotRegistered",
      },
    ],
  });

  const result = await service.pushToUser({
    userId: "u_1",
    previewText: "hello",
    messageId: "m_1",
  });

  assert.deepEqual(result, { delivered: false, deviceCount: 1 });
  assert.deepEqual(cleared, [{ deviceId: "dev_1", expoPushToken: "ExponentPushToken[dead]" }]);
});

test("checkPendingReceipts marks checked and clears DeviceNotRegistered tokens", async () => {
  const { service, checked, cleared } = createHarness({
    targets: [
      { deviceId: "dev_1", expoPushToken: "ExponentPushToken[one]" },
      { deviceId: "dev_2", expoPushToken: "ExponentPushToken[two]" },
    ],
    receipts: {
      "ticket-1": { status: "ok" },
      "ticket-2": { status: "error", error: "DeviceNotRegistered" },
    },
  });

  const result = await service.checkPendingReceipts({ limit: 2 });

  assert.deepEqual(result, { checked: 2, cleared: 1 });
  assert.deepEqual(checked, ["ticket-1", "ticket-2", "row-1", "row-2"]);
  assert.deepEqual(cleared, [{ deviceId: "dev_2", expoPushToken: "ExponentPushToken[two]" }]);
});
