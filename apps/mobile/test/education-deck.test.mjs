import assert from "node:assert/strict";
import test from "node:test";

import { createEducationDeckController } from "../dist/domains/onboarding/service/education-deck.js";

test("navigates, skips, and resets the education deck", () => {
  const controller = createEducationDeckController();
  controller.dispatch({ type: "previous" });
  assert.equal(controller.getSnapshot().index, 0);

  controller.dispatch({ type: "next" });
  controller.dispatch({ type: "previous" });
  assert.equal(controller.getSnapshot().index, 0);

  for (let index = 0; index < 4; index += 1) controller.dispatch({ type: "next" });
  assert.deepEqual(controller.getSnapshot(), { index: 4, complete: false });
  controller.dispatch({ type: "next" });
  assert.equal(controller.getSnapshot().complete, true);

  controller.dispatch({ type: "reset" });
  assert.deepEqual(controller.getSnapshot(), { index: 0, complete: false });
  controller.dispatch({ type: "skip" });
  assert.equal(controller.getSnapshot().complete, true);
});
