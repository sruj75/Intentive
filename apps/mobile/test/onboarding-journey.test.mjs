import assert from "node:assert/strict";
import test from "node:test";

import { createOnboardingJourneyController } from "../dist/domains/onboarding/service/onboarding-journey.js";
import { validateFullName } from "../dist/domains/onboarding/service/name-validation.js";

test("validates and normalizes a complete name", () => {
  assert.deepEqual(validateFullName("Srujan"), {
    ok: false,
    error: "Enter your first and last name",
  });
  assert.deepEqual(validateFullName("  Srujan   Gowda  "), {
    ok: true,
    value: "Srujan Gowda",
  });
});

test("owns the B-to-D onboarding journey", () => {
  const controller = createOnboardingJourneyController();
  assert.deepEqual(controller.getSnapshot(), {
    stage: "name",
    fullName: "",
    nameError: null,
  });

  controller.dispatch({ type: "name_edited", value: "Srujan" });
  controller.dispatch({ type: "name_submitted" });
  assert.equal(controller.getSnapshot().stage, "name");
  assert.equal(controller.getSnapshot().nameError, "Enter your first and last name");

  controller.dispatch({ type: "name_edited", value: "  Srujan   Gowda  " });
  controller.dispatch({ type: "name_submitted" });
  assert.equal(controller.getSnapshot().stage, "friends_intro");
  assert.equal(controller.getSnapshot().fullName, "Srujan Gowda");

  controller.dispatch({ type: "advanced" });
  assert.equal(controller.getSnapshot().stage, "permissions_intro");
  controller.dispatch({ type: "advanced" });
  assert.equal(controller.getSnapshot().stage, "complete");
});

test("publishes only changed journey snapshots and resets", () => {
  const controller = createOnboardingJourneyController();
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => {
    notifications += 1;
  });
  controller.dispatch({ type: "advanced" });
  assert.equal(notifications, 0);
  controller.dispatch({ type: "name_edited", value: "A B" });
  assert.equal(notifications, 1);
  controller.dispatch({ type: "reset" });
  assert.equal(controller.getSnapshot().fullName, "");
  unsubscribe();
  controller.dispose();
});
