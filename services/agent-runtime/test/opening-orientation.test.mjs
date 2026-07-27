import assert from "node:assert/strict";
import test from "node:test";

import { createOpeningOrientation } from "../dist/index.js";

const userId = "00000000-0000-4000-8000-000000000001";
const windowId = "11111111-1111-4111-8111-111111111111";
const messageId = `opening:${windowId}`;

test("Opening Orientation commits one stable window-bound message then delivers to that window", async () => {
  const queries = [];
  const deliveries = [];
  const bootstrapQuery = Promise.resolve([{ status: "in_progress" }]);
  let execution;
  let claims = 0;
  const opening = createOpeningOrientation({
    bootstrap: {
      prepareOpening: async () => ({
        firstRun: true,
        transitionOnSuccessQuery: () => bootstrapQuery,
      }),
    },
    windows: {
      claimOpening: async () => {
        claims += 1;
        return {
          userId,
          windowId,
          messageId,
          body: claims === 1 ? null : "What important outcome should we protect?",
        };
      },
      isActive: async () => true,
      markOpeningReadyQuery: () => "ready-opening",
      releaseOpeningQuery: () => "release-opening",
    },
    conversation: {
      appendQuery: (entry) => (queries.push(entry), "append-orientation"),
    },
    deliveryPort: {
      deliverCoachingProactive: async (message) => (deliveries.push(message), true),
    },
    turn: async (input) => {
      execution = input;
      assert.equal(await input.beforeCommit(), true);
      assert.deepEqual(input.onSuccess(output()), [
        "append-orientation",
        "ready-opening",
        bootstrapQuery,
      ]);
      return output();
    },
    isEligible: () => true,
    isActivelyAttested: () => true,
  });

  assert.equal(await opening.run(userId, windowId, floor("connection_floor_v1")), true);
  assert.equal(execution.trigger, "opening_orientation");
  assert.equal((await execution.floor()).version, "connection_floor_v1");
  assert.equal(execution.windowId, windowId);
  assert.equal(execution.evidenceVersion, `opening:${windowId}`);
  assert.equal(execution.firstRun, true);
  assert.deepEqual(queries, [
    {
      userId,
      messageId,
      author: "companion",
      body: "What important outcome should we protect?",
      viaPostMessageBack: true,
      windowId,
    },
  ]);
  assert.deepEqual(deliveries, [
    {
      userId,
      messageId,
      body: "What important outcome should we protect?",
      windowId,
    },
  ]);
});

test("a user-authored opening-id collision never becomes a welcome and remains retryable", async () => {
  const userAuthoredCollision = "This text came from the user.";
  const deliveries = [];
  let turns = 0;
  let claims = 0;
  const opening = createOpeningOrientation({
    bootstrap: bootstrap("completed"),
    windows: {
      // A conflicting user row makes the trusted ready commit a no-op, so every
      // claim remains running and never exposes that row's body.
      claimOpening: async () => {
        claims += 1;
        return { userId, windowId, messageId, body: null };
      },
      isActive: async () => true,
      markOpeningReadyQuery: () => "trusted-ready-only",
      releaseOpeningQuery: () => "release-opening",
    },
    conversation: {
      appendQuery: (entry) => {
        assert.notEqual(entry.body, userAuthoredCollision);
        assert.equal(entry.author, "companion");
        assert.equal(entry.windowId, windowId);
        assert.equal(entry.viaPostMessageBack, true);
        return "append-conflicts-with-user-row";
      },
    },
    deliveryPort: {
      deliverCoachingProactive: async (message) => (deliveries.push(message), true),
    },
    turn: async (input) => {
      turns += 1;
      input.onSuccess(output());
      return output();
    },
    isEligible: () => true,
    isActivelyAttested: () => true,
  });

  assert.equal(await opening.run(userId, windowId, floor("floor_v1")), false);
  assert.equal(await opening.run(userId, windowId, floor("floor_v1")), false);
  assert.equal(turns, 2);
  assert.equal(claims, 4);
  assert.deepEqual(deliveries, []);
  assert.equal(
    deliveries.some((message) => message.body === userAuthoredCollision),
    false,
  );
});

test("Opening Orientation rejects whitespace model output and releases its claim for retry", async () => {
  const failureQueries = [];
  const deliveries = [];
  let claims = 0;
  let turns = 0;
  let appendCalls = 0;
  let readyCalls = 0;
  let releases = 0;
  const opening = createOpeningOrientation({
    bootstrap: bootstrap("completed"),
    windows: {
      claimOpening: async () => {
        claims += 1;
        return { userId, windowId, messageId, body: null };
      },
      isActive: async () => true,
      markOpeningReadyQuery: () => {
        readyCalls += 1;
        return "ready-opening";
      },
      releaseOpeningQuery: () => {
        releases += 1;
        return `release-opening-${releases}`;
      },
    },
    conversation: {
      appendQuery: () => {
        appendCalls += 1;
        return "append-orientation";
      },
    },
    deliveryPort: {
      deliverCoachingProactive: async (message) => (deliveries.push(message), true),
    },
    turn: async (input) => {
      turns += 1;
      let validationError;
      try {
        input.onSuccess({ ...output(), reply: " \n\t " });
      } catch (error) {
        validationError = error;
      }
      assert.ok(validationError instanceof Error);
      const failure = input.onFailure(validationError);
      assert.equal(failure.rethrow, false);
      failureQueries.push(...failure.queries);
      return null;
    },
    isEligible: () => true,
    isActivelyAttested: () => true,
  });

  assert.equal(await opening.run(userId, windowId, floor("floor_v1")), false);
  assert.equal(await opening.run(userId, windowId, floor("floor_v1")), false);
  assert.equal(claims, 2);
  assert.equal(turns, 2);
  assert.equal(appendCalls, 0);
  assert.equal(readyCalls, 0);
  assert.equal(releases, 2);
  assert.deepEqual(failureQueries, ["release-opening-1", "release-opening-2"]);
  assert.deepEqual(deliveries, []);
});

test("Opening Orientation resends a ready welcome with the same id until Desktop acknowledges it", async () => {
  let turns = 0;
  let deliveries = 0;
  const opening = createOpeningOrientation({
    bootstrap: bootstrap("completed"),
    windows: {
      claimOpening: async () => ({
        userId,
        windowId,
        messageId,
        body: "What important outcome should we protect?",
      }),
      isActive: async () => true,
      markOpeningReadyQuery: () => assert.fail("ready message must not rerun"),
      releaseOpeningQuery: () => assert.fail("ready message must not release"),
    },
    conversation: { appendQuery: () => assert.fail("ready message must not append") },
    deliveryPort: {
      deliverCoachingProactive: async () => {
        deliveries += 1;
        return true;
      },
    },
    turn: async () => {
      turns += 1;
      return output();
    },
    isEligible: () => true,
    isActivelyAttested: () => true,
  });

  assert.equal(await opening.run(userId, windowId, floor("floor_v1")), true);
  assert.equal(turns, 0);
  assert.equal(deliveries, 1);
});

test("reconnect before acknowledgement resends the stable opening id and completion suppresses later resend", async () => {
  let status = "ready";
  const deliveries = [];
  const opening = createOpeningOrientation({
    bootstrap: bootstrap("completed"),
    windows: {
      claimOpening: async () =>
        status === "ready"
          ? {
              userId,
              windowId,
              messageId,
              body: "What important outcome should we protect?",
            }
          : null,
      isActive: async () => true,
      markOpeningReadyQuery: () => assert.fail("ready message must not rerun"),
      releaseOpeningQuery: () => assert.fail("ready message must not release"),
    },
    conversation: { appendQuery: () => assert.fail("ready message must not append") },
    deliveryPort: {
      deliverCoachingProactive: async (message) => (deliveries.push(message.messageId), true),
    },
    turn: async () => assert.fail("ready message must not rerun"),
    isEligible: () => true,
    isActivelyAttested: () => true,
  });

  assert.equal(await opening.run(userId, windowId, floor("floor_v1")), true);
  assert.equal(await opening.run(userId, windowId, floor("floor_v1")), true);
  assert.deepEqual(deliveries, [messageId, messageId]);

  status = "completed";
  assert.equal(await opening.run(userId, windowId, floor("floor_v1")), false);
  assert.deepEqual(deliveries, [messageId, messageId]);
});

test("Opening Orientation leaves a ready welcome retryable when socket delivery fails", async () => {
  const opening = createOpeningOrientation({
    bootstrap: bootstrap("completed"),
    windows: {
      claimOpening: async () => ({
        userId,
        windowId,
        messageId,
        body: "What important outcome should we protect?",
      }),
      isActive: async () => true,
      markOpeningReadyQuery: () => assert.fail("ready message must not rerun"),
      releaseOpeningQuery: () => assert.fail("ready message must not release"),
    },
    conversation: { appendQuery: () => assert.fail("ready message must not append") },
    deliveryPort: { deliverCoachingProactive: async () => false },
    turn: async () => assert.fail("ready message must not rerun"),
    isEligible: () => true,
    isActivelyAttested: () => true,
  });

  assert.equal(await opening.run(userId, windowId, floor("floor_v1")), false);
});

test("Opening Orientation stays pending when live attestation disappears before commit", async () => {
  const failureQueries = [];
  let attestedChecks = 0;
  const opening = createOpeningOrientation({
    bootstrap: bootstrap("completed"),
    windows: {
      claimOpening: async () => ({ userId, windowId, messageId, body: null }),
      isActive: async () => true,
      markOpeningReadyQuery: () => assert.fail("must not mark ready"),
      releaseOpeningQuery: () => "release-opening",
    },
    conversation: { appendQuery: () => assert.fail("must not append") },
    deliveryPort: {
      deliverCoachingProactive: async () => assert.fail("must not deliver"),
    },
    turn: async (input) => {
      assert.equal(await input.beforeCommit(), false);
      failureQueries.push(...input.onFailure(new Error("stale")).queries);
      return null;
    },
    isEligible: () => true,
    isActivelyAttested: () => {
      attestedChecks += 1;
      return attestedChecks === 1;
    },
  });

  assert.equal(await opening.run(userId, windowId, floor("floor_v1")), false);
  assert.deepEqual(failureQueries, ["release-opening"]);
});

test("Opening Orientation does no model work for a disabled or duplicate window", async () => {
  let claims = 0;
  let turns = 0;
  const base = {
    bootstrap: bootstrap("completed"),
    windows: {
      claimOpening: async () => {
        claims += 1;
        return null;
      },
      isActive: async () => true,
      markOpeningReadyQuery: () => "ready",
      releaseOpeningQuery: () => "release",
    },
    conversation: { appendQuery: () => "append" },
    deliveryPort: { deliverCoachingProactive: async () => {} },
    turn: async () => {
      turns += 1;
      return output();
    },
    isActivelyAttested: () => true,
  };

  const disabled = createOpeningOrientation({ ...base, isEligible: () => false });
  assert.equal(await disabled.run(userId, windowId, floor("floor_v1")), false);
  assert.equal(claims, 0);

  const duplicate = createOpeningOrientation({ ...base, isEligible: () => true });
  assert.equal(await duplicate.run(userId, windowId, floor("floor_v1")), false);
  assert.equal(claims, 1);
  assert.equal(turns, 0);
});

function output() {
  return {
    reply: "What important outcome should we protect?",
    traceId: "trace_1",
    model: "model",
    bundleVersion: "floor_v1",
  };
}

function bootstrap(status) {
  return {
    prepareOpening: async () => ({
      firstRun: status !== "completed",
      transitionOnSuccessQuery: () => {
        if (status === "pending") {
          return Promise.resolve([]);
        }
        return null;
      },
    }),
  };
}

function floor(version) {
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
