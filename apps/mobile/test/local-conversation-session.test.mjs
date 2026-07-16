import assert from "node:assert/strict";
import test from "node:test";

import { createLocalConversationSession } from "../dist/domains/chat/runtime/local-conversation-session.js";

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
      assert.ok(entry, "expected a scheduled conversation transition");
      const [id, callback] = entry;
      jobs.delete(id);
      callback();
    },
    get size() {
      return jobs.size;
    },
  };
}

test("runs one deterministic local conversation turn", () => {
  const clock = createScheduler();
  const session = createLocalConversationSession({
    firstName: "Srujan",
    scheduler: clock.scheduler,
  });
  assert.deepEqual(
    session.getSnapshot().timeline.map((item) => item.kind),
    ["capability_card", "suggestion_group"],
  );

  session.send("What can you do for me?");
  assert.equal(session.getSnapshot().phase, "user_sent");
  assert.equal(session.getSnapshot().timeline.at(-1).kind, "user_message");
  assert.equal(clock.size, 3);

  clock.flushNext();
  assert.deepEqual(session.getSnapshot().timeline.at(-1), {
    id: "activity-1",
    kind: "activity",
    phase: "thinking",
  });
  clock.flushNext();
  assert.equal(session.getSnapshot().phase, "composing");
  clock.flushNext();
  assert.equal(session.getSnapshot().phase, "replied");
  assert.match(session.getSnapshot().timeline.at(-1).text, /Hey Srujan/);
});

test("replacement turns cancel timers and disposal clears pending work", () => {
  const clock = createScheduler();
  const session = createLocalConversationSession({ scheduler: clock.scheduler });
  session.send("First");
  assert.equal(clock.size, 3);
  session.send("Replacement");
  assert.equal(clock.size, 3);
  assert.equal(session.getSnapshot().timeline.at(-1).text, "Replacement");

  clock.flushNext();
  clock.flushNext();
  clock.flushNext();
  session.send("Pending");
  assert.equal(clock.size, 3);
  session.dispose();
  assert.equal(clock.size, 0);
});
