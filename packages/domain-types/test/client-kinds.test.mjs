import test from "node:test";
import assert from "node:assert/strict";

import { CLIENT_KINDS } from "../dist/index.js";

// CLIENT_KINDS is the canonical source of truth the wire packages
// (@intentive/protocol, @intentive/api-contract) derive their enums from.
// This guards the membership that adding/removing a client must go through.
test("CLIENT_KINDS holds exactly the v1 Client Kinds", () => {
  assert.deepEqual([...CLIENT_KINDS], ["mobile", "desktop", "android"]);
});
