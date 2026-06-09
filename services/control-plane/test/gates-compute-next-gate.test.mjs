/**
 * Pure gate sequencing, the heart of the slice: no I/O, no fakes — just the
 * decision "given this user's recorded gate state, what gate is next?". The
 * cross-client order is Consent Primer → Sibling Invitation → done. `identity`
 * is never returned here: the auth boundary owns that gate (ADR-0004), not this
 * function.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { computeNextGate } from "../dist/domains/gates/service/compute-next-gate.js";

test("an uncompleted consent is the first gate", () => {
  assert.equal(
    computeNextGate({ consentCompleted: false, siblingSkipped: false }),
    "consent_primer",
  );
});

test("consent done but sibling not resolved advances to the sibling invitation", () => {
  assert.equal(
    computeNextGate({ consentCompleted: true, siblingSkipped: false }),
    "sibling_client_invitation",
  );
});

test("both cross-client gates resolved leaves no gate pending", () => {
  assert.equal(computeNextGate({ consentCompleted: true, siblingSkipped: true }), null);
});
