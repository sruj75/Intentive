import assert from "node:assert/strict";
import test from "node:test";

import { createDevRuntimeAdapter } from "../dist/domains/chat/runtime/dev-transport.js";

test("dev transport seeds a Protocol-shaped opening without a backend", async () => {
  const adapter = createDevRuntimeAdapter();
  await adapter.connect();
  await waitFor(() => adapter.getState().messages.length > 0);

  assert.equal(adapter.getState().messages[0].id, "dev-opening");
  assert.equal(adapter.getState().connectionState, "connected");

  adapter.close();
});

test("dev transport sends a canned companion reply after a user message", async () => {
  const adapter = createDevRuntimeAdapter();
  await adapter.connect();
  await waitFor(() => adapter.getState().messages.length > 0);

  await adapter.sendUserMessage("hello");
  await waitFor(() =>
    adapter.getState().messages.some((message) => message.id.startsWith("dev-companion-")),
  );

  assert.ok(adapter.getState().messages.at(-1).body.includes("hello"));
  adapter.close();
});

async function waitFor(predicate) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 500) throw new Error("timed out waiting for dev transport");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
