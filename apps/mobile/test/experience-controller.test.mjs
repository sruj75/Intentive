import assert from "node:assert/strict";
import test from "node:test";

import { createLocalExperienceController } from "../dist/experience/controller.js";

function createScheduler() {
  let nextId = 0;
  const jobs = new Map();

  return {
    scheduler: {
      setTimeout(callback) {
        const id = ++nextId;
        jobs.set(id, callback);
        return id;
      },
      clearTimeout(id) {
        jobs.delete(id);
      },
    },
    flushNext() {
      const entry = jobs.entries().next().value;
      assert.ok(entry, "expected a scheduled experience transition");
      const [id, callback] = entry;
      jobs.delete(id);
      callback();
    },
    get size() {
      return jobs.size;
    },
  };
}

function reachWelcome(controller) {
  controller.dispatch({ type: "authentication_selected", method: "apple" });
  controller.dispatch({ type: "name_edited", value: "Srujan Gowda" });
  controller.dispatch({ type: "name_submitted" });
  controller.dispatch({ type: "advance" });
  controller.dispatch({ type: "advance" });
  assert.equal(controller.getSnapshot().scene, "chat");
  assert.equal(controller.getSnapshot().chatMode, "welcome");
}

test("walks the A-to-K scene model and validates a complete name", () => {
  const controller = createLocalExperienceController();
  assert.equal(controller.getSnapshot().scene, "auth");

  controller.dispatch({ type: "authentication_selected", method: "phone" });
  assert.equal(controller.getSnapshot().scene, "name");

  controller.dispatch({ type: "name_edited", value: "Srujan" });
  controller.dispatch({ type: "name_submitted" });
  assert.equal(controller.getSnapshot().scene, "name");
  assert.equal(controller.getSnapshot().nameError, "Enter your first and last name");

  controller.dispatch({ type: "name_edited", value: "  Srujan   Gowda  " });
  controller.dispatch({ type: "name_submitted" });
  assert.equal(controller.getSnapshot().scene, "friends_intro");
  assert.equal(controller.getSnapshot().fullName, "Srujan Gowda");
  assert.equal(controller.getSnapshot().firstName, "Srujan");
  assert.equal(controller.getSnapshot().initials, "SG");

  controller.dispatch({ type: "advance" });
  assert.equal(controller.getSnapshot().scene, "permissions_intro");
  controller.dispatch({ type: "advance" });
  assert.equal(controller.getSnapshot().scene, "chat");
  assert.equal(controller.getSnapshot().chatMode, "welcome");
  controller.dispatch({ type: "advance" });
  assert.equal(controller.getSnapshot().scene, "education");

  controller.dispatch({ type: "education_next" });
  controller.dispatch({ type: "education_previous" });
  assert.equal(controller.getSnapshot().educationIndex, 0);

  for (let index = 0; index < 4; index += 1) {
    assert.equal(controller.getSnapshot().educationIndex, index);
    controller.dispatch({ type: "education_next" });
  }
  assert.equal(controller.getSnapshot().educationIndex, 4);
  controller.dispatch({ type: "education_next" });
  assert.equal(controller.getSnapshot().scene, "chat");
  assert.equal(controller.getSnapshot().chatMode, "ready");
  assert.deepEqual(
    controller.getSnapshot().timeline.map((item) => item.kind),
    ["capability_card", "suggestion_group"],
  );
});

test("supports skipping, overlays, session settings, replay, and a complete logout reset", () => {
  const controller = createLocalExperienceController();
  reachWelcome(controller);

  controller.dispatch({ type: "overlay_opened", overlay: "drawer" });
  assert.equal(controller.getSnapshot().overlay, "drawer");
  controller.dispatch({ type: "overlay_opened", overlay: "settings" });
  assert.equal(controller.getSnapshot().overlay, "settings");

  controller.dispatch({ type: "setting_toggled", setting: "privacy" });
  controller.dispatch({ type: "privacy_rule_edited", value: "Keep work private" });
  assert.equal(controller.getSnapshot().settings.privacy, false);
  assert.equal(controller.getSnapshot().settings.additionalPrivacyRules, "Keep work private");

  controller.dispatch({ type: "education_replayed" });
  assert.equal(controller.getSnapshot().scene, "education");
  assert.equal(controller.getSnapshot().educationIndex, 0);
  assert.equal(controller.getSnapshot().overlay, "none");
  controller.dispatch({ type: "education_skipped" });
  assert.equal(controller.getSnapshot().scene, "chat");
  assert.equal(controller.getSnapshot().chatMode, "ready");

  controller.dispatch({ type: "overlay_opened", overlay: "settings" });
  controller.dispatch({ type: "logged_out" });
  assert.equal(controller.getSnapshot().scene, "auth");
  assert.equal(controller.getSnapshot().fullName, "");
  assert.equal(controller.getSnapshot().settings.privacy, true);
  assert.equal(controller.getSnapshot().timeline.length, 0);
});

test("runs one deterministic local conversation turn and cleans up timers", () => {
  const clock = createScheduler();
  const controller = createLocalExperienceController({ scheduler: clock.scheduler });
  reachWelcome(controller);
  controller.dispatch({ type: "advance" });
  controller.dispatch({ type: "education_skipped" });

  controller.dispatch({ type: "suggestion_selected", value: "What can you do for me?" });
  assert.equal(controller.getSnapshot().composerValue, "What can you do for me?");
  controller.dispatch({ type: "composer_submitted" });
  assert.equal(controller.getSnapshot().chatPhase, "user_sent");
  assert.equal(controller.getSnapshot().composerValue, "");
  assert.equal(controller.getSnapshot().timeline.at(-1).kind, "user_message");
  assert.equal(clock.size, 3);

  clock.flushNext();
  assert.equal(controller.getSnapshot().chatPhase, "thinking");
  assert.deepEqual(controller.getSnapshot().timeline.at(-1), {
    id: "activity-1",
    kind: "activity",
    phase: "thinking",
  });

  clock.flushNext();
  assert.equal(controller.getSnapshot().chatPhase, "composing");
  assert.equal(controller.getSnapshot().timeline.at(-1).phase, "composing");

  clock.flushNext();
  assert.equal(controller.getSnapshot().chatPhase, "replied");
  const reply = controller.getSnapshot().timeline.at(-1);
  assert.equal(reply.kind, "companion_message");
  assert.match(reply.text, /Hey Srujan/);
  assert.equal(clock.size, 0);

  controller.dispatch({ type: "composer_edited", value: "Another question" });
  controller.dispatch({ type: "composer_submitted" });
  assert.equal(clock.size, 3);
  clock.flushNext();
  clock.flushNext();
  clock.flushNext();
  assert.equal(controller.getSnapshot().chatPhase, "replied");
  assert.equal(
    controller.getSnapshot().timeline.at(-1).text,
    "I’m right here. This local prototype can keep the conversation moving while we shape the real experience.",
  );
  assert.equal(clock.size, 0);

  controller.dispatch({ type: "composer_edited", value: "Cancelled question" });
  controller.dispatch({ type: "composer_submitted" });
  assert.equal(clock.size, 3);
  controller.dispose();
  assert.equal(clock.size, 0);
});

test("publishes immutable snapshots only when state changes", () => {
  const controller = createLocalExperienceController();
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => {
    notifications += 1;
  });

  controller.dispatch({ type: "composer_submitted" });
  assert.equal(notifications, 0);
  controller.dispatch({ type: "authentication_selected", method: "apple" });
  assert.equal(notifications, 1);
  assert.notEqual(controller.getSnapshot(), controller.getSnapshot().settings);

  unsubscribe();
  controller.dispatch({ type: "name_edited", value: "A B" });
  assert.equal(notifications, 1);
});
