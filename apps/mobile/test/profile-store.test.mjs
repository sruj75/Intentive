import assert from "node:assert/strict";
import test from "node:test";

import { createProfileStore } from "../dist/providers/profile/profile-store.js";

test("shares normalized in-memory profile identity and resets it", () => {
  const store = createProfileStore();
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });
  assert.deepEqual(store.getSnapshot(), { fullName: "", firstName: "", initials: "" });
  store.setName("Srujan Gowda");
  assert.deepEqual(store.getSnapshot(), {
    fullName: "Srujan Gowda",
    firstName: "Srujan",
    initials: "SG",
  });
  store.setName("Srujan Gowda");
  assert.equal(notifications, 1);
  store.reset();
  assert.deepEqual(store.getSnapshot(), { fullName: "", firstName: "", initials: "" });
});
