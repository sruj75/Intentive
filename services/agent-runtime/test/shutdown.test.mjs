import assert from "node:assert/strict";
import test from "node:test";

import { createShutdown } from "../dist/index.js";

test("runtime shutdown drains schedulers, sockets, servers, observability, then exits", async () => {
  const order = [];
  const closes = [];
  const clients = [
    client("open", 1, closes),
    client("connecting", 0, closes),
    client("closed", 3, closes),
  ];
  const shutdown = createShutdown({
    schedulers: [
      { stop: () => order.push("cron.stop") },
      { stop: () => order.push("heartbeat.stop") },
    ],
    wss: {
      clients: new Set(clients),
      close: (callback) => {
        order.push("wss.close");
        callback();
      },
    },
    internalServer: {
      close: (callback) => {
        order.push("internal.close");
        callback();
      },
    },
    observability: {
      shutdown: async () => {
        order.push("observability.shutdown");
      },
    },
    exit: (code) => order.push(`exit.${code}`),
  });

  await shutdown("SIGTERM");

  assert.deepEqual(closes, [
    ["open", 1001, "runtime_shutdown"],
    ["connecting", 1001, "runtime_shutdown"],
  ]);
  assert.deepEqual(order, [
    "cron.stop",
    "heartbeat.stop",
    "wss.close",
    "internal.close",
    "observability.shutdown",
    "exit.0",
  ]);
});

test("runtime shutdown treats already-closed servers as drained", async () => {
  const order = [];
  const notRunning = Object.assign(new Error("server is not running"), {
    code: "ERR_SERVER_NOT_RUNNING",
  });
  const shutdown = createShutdown({
    schedulers: [],
    wss: {
      clients: new Set(),
      close: (callback) => callback(notRunning),
    },
    internalServer: {
      close: (callback) => callback(notRunning),
    },
    observability: {
      shutdown: async () => order.push("observability.shutdown"),
    },
    exit: (code) => order.push(`exit.${code}`),
  });

  await shutdown();

  assert.deepEqual(order, ["observability.shutdown", "exit.0"]);
});

test("runtime shutdown is idempotent", async () => {
  const order = [];
  const shutdown = createShutdown({
    schedulers: [{ stop: () => order.push("stop") }],
    wss: {
      clients: new Set(),
      close: (callback) => {
        order.push("wss.close");
        callback();
      },
    },
    internalServer: {
      close: (callback) => {
        order.push("internal.close");
        callback();
      },
    },
    observability: {
      shutdown: async () => order.push("observability.shutdown"),
    },
    exit: (code) => order.push(`exit.${code}`),
  });

  await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);

  assert.deepEqual(order, [
    "stop",
    "wss.close",
    "internal.close",
    "observability.shutdown",
    "exit.0",
  ]);
});

function client(name, readyState, closes) {
  return {
    readyState,
    OPEN: 1,
    CONNECTING: 0,
    close: (code, reason) => closes.push([name, code, reason]),
  };
}
