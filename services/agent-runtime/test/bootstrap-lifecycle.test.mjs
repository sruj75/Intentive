import assert from "node:assert/strict";
import test from "node:test";

import { createBootstrapLifecycle } from "../dist/index.js";

const userId = "00000000-0000-4000-8000-000000000001";

test("a pending bootstrap starts atomically with its first Opening Orientation", async () => {
  const inProgressQuery = Promise.resolve([{ bootstrap_status: "in_progress" }]);
  const lifecycle = createBootstrapLifecycle({
    readStatus: async () => "pending",
    markInProgressQuery: () => inProgressQuery,
    markCompletedQuery: () => assert.fail("opening must not complete bootstrap"),
  });

  const opening = await lifecycle.prepareOpening(userId);

  assert.equal(opening.firstRun, true);
  assert.equal(opening.transitionOnSuccessQuery(), inProgressQuery);
});

test("a later Opening Orientation resumes an in-progress bootstrap without restarting it", async () => {
  const lifecycle = createBootstrapLifecycle({
    readStatus: async () => "in_progress",
    markInProgressQuery: () => assert.fail("in-progress bootstrap must not restart"),
    markCompletedQuery: () => assert.fail("opening must not complete bootstrap"),
  });

  const opening = await lifecycle.prepareOpening(userId);

  assert.equal(opening.firstRun, true);
  assert.equal(opening.transitionOnSuccessQuery(), null);
});

test("a completed bootstrap is omitted from later Opening Orientations", async () => {
  const lifecycle = createBootstrapLifecycle({
    readStatus: async () => "completed",
    markInProgressQuery: () => assert.fail("completed bootstrap must not restart"),
    markCompletedQuery: () => assert.fail("completed bootstrap must not complete again"),
  });

  const opening = await lifecycle.prepareOpening(userId);

  assert.equal(opening.firstRun, false);
  assert.equal(opening.transitionOnSuccessQuery(), null);
});

test("only an eligible Desktop-window reply completes an in-progress bootstrap", async () => {
  const completedQuery = Promise.resolve([{ bootstrap_status: "completed" }]);
  let reads = 0;
  const lifecycle = createBootstrapLifecycle({
    readStatus: async () => {
      reads += 1;
      return "in_progress";
    },
    markInProgressQuery: () => assert.fail("interactive turn must not start bootstrap"),
    markCompletedQuery: () => completedQuery,
  });

  const ineligible = await lifecycle.prepareInteractive(userId, false);
  assert.equal(ineligible.firstRun, false);
  assert.equal(ineligible.transitionOnSuccessQuery(), null);
  assert.equal(reads, 0);

  const eligible = await lifecycle.prepareInteractive(userId, true);
  assert.equal(eligible.firstRun, true);
  assert.equal(eligible.transitionOnSuccessQuery(), completedQuery);
  assert.equal(reads, 1);
});
