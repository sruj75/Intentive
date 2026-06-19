/**
 * Gates service, hermetic: a fake `UserGatesRepo` stands in for storage so this
 * tier proves the composition (read state → sequence it) and the write
 * delegation, with no database. The sequencing itself is pinned by
 * gates-compute-next-gate.test.mjs; here we only prove the service wires the
 * repo to that decision and forwards the writes.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createGatesService } from "../dist/domains/gates/service/gates-service.js";

const recordingLogger = (records) => ({
  info: (event, attrs) => records.push({ level: "info", event, attrs }),
  warn: (event, attrs) => records.push({ level: "warn", event, attrs }),
  error: (event, error, attrs) => records.push({ level: "error", event, error, attrs }),
  child: () => recordingLogger(records),
});

test("nextGate sequences the state the repo reports for the user", async () => {
  const seen = [];
  const gates = createGatesService({
    userGates: {
      readState: async (userId) => {
        seen.push(userId);
        return { consentCompleted: false, siblingSkipped: false };
      },
      recordConsent: async () => assert.fail("read path must not write"),
      recordSiblingSkip: async () => assert.fail("read path must not write"),
    },
  });

  assert.equal(await gates.nextGate("u_1"), "consent_primer");
  assert.deepEqual(seen, ["u_1"], "nextGate reads the gate state for exactly that user");
});

test("nextGate returns null once the repo reports both gates resolved", async () => {
  const gates = createGatesService({
    userGates: {
      readState: async () => ({ consentCompleted: true, siblingSkipped: true }),
      recordConsent: async () => {},
      recordSiblingSkip: async () => {},
    },
  });

  assert.equal(await gates.nextGate("u_1"), null);
});

test("nextGate merges the composer's device context with the repo's cross-client state", async () => {
  const gates = createGatesService({
    userGates: {
      // Cross-client gates cleared; the pending gate must come from the device context.
      readState: async () => ({ consentCompleted: true, siblingSkipped: true }),
      recordConsent: async () => {},
      recordSiblingSkip: async () => {},
    },
  });

  assert.equal(
    await gates.nextGate("u_1", { clientKind: "desktop", capturePermissionGranted: false }),
    "capture_permission_setup",
  );
});

test("recordConsent forwards the user to the repo", async () => {
  const seen = [];
  const gates = createGatesService({
    userGates: {
      readState: async () => assert.fail("write path must not read"),
      recordConsent: async (userId) => seen.push(userId),
      recordSiblingSkip: async () => assert.fail("wrong write"),
    },
  });

  await gates.recordConsent("u_42");
  assert.deepEqual(seen, ["u_42"]);
});

test("recordConsent logs the accepted gate transition", async () => {
  const records = [];
  const gates = createGatesService({
    userGates: {
      readState: async () => assert.fail("write path must not read"),
      recordConsent: async () => {},
      recordSiblingSkip: async () => assert.fail("wrong write"),
    },
    logger: recordingLogger(records),
  });

  await gates.recordConsent("u_42");
  assert.deepEqual(records, [
    {
      level: "info",
      event: "gates.transition",
      attrs: { user_id: "u_42", status: "consent_completed" },
    },
  ]);
});

test("recordSiblingSkip forwards the user to the repo", async () => {
  const seen = [];
  const gates = createGatesService({
    userGates: {
      readState: async () => assert.fail("write path must not read"),
      recordConsent: async () => assert.fail("wrong write"),
      recordSiblingSkip: async (userId) => seen.push(userId),
    },
  });

  await gates.recordSiblingSkip("u_42");
  assert.deepEqual(seen, ["u_42"]);
});
