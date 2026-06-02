import assert from "node:assert/strict";
import test from "node:test";

import { resolveLaunchState } from "../dist/domains/onboarding/service/resolve-launch-state.js";

/**
 * The nine-case contract for the Launch State Resolver. These tests ARE the
 * specification that #19–#22 build against: the four happy paths plus the five
 * cases that encode the design decisions (RESOLVING, the signed-out
 * short-circuit, and skip-vs-completed both advancing).
 */

// --- happy paths -----------------------------------------------------------

test("signed out → SIGNED_OUT", () => {
  assert.equal(
    resolveLaunchState({ signedIn: false, consent: "pending", siblingInvitation: "pending" }),
    "SIGNED_OUT",
  );
});

test("signed in, consent pending → MISSING_CONSENT", () => {
  assert.equal(
    resolveLaunchState({ signedIn: true, consent: "pending", siblingInvitation: "pending" }),
    "MISSING_CONSENT",
  );
});

test("consent done, sibling pending → SIBLING_INVITATION_PENDING", () => {
  assert.equal(
    resolveLaunchState({ signedIn: true, consent: "completed", siblingInvitation: "pending" }),
    "SIBLING_INVITATION_PENDING",
  );
});

test("consent done, sibling completed → READY_FOR_CHAT", () => {
  assert.equal(
    resolveLaunchState({ signedIn: true, consent: "completed", siblingInvitation: "completed" }),
    "READY_FOR_CHAT",
  );
});

// --- design-encoding cases -------------------------------------------------

test("everything unknown (cold start) → RESOLVING", () => {
  assert.equal(
    resolveLaunchState({ signedIn: null, consent: null, siblingInvitation: null }),
    "RESOLVING",
  );
});

test("signed in but gates not yet loaded → RESOLVING", () => {
  assert.equal(
    resolveLaunchState({ signedIn: true, consent: null, siblingInvitation: null }),
    "RESOLVING",
  );
});

test("signed out short-circuits past unknown gates → SIGNED_OUT (not RESOLVING)", () => {
  // Proves we evaluate in order and stop: a signed-out user never waits on
  // GET /me, which can't even be called without a session.
  assert.equal(
    resolveLaunchState({ signedIn: false, consent: null, siblingInvitation: null }),
    "SIGNED_OUT",
  );
});

test("sibling skipped advances → READY_FOR_CHAT (skip ≠ pending)", () => {
  assert.equal(
    resolveLaunchState({ signedIn: true, consent: "completed", siblingInvitation: "skipped" }),
    "READY_FOR_CHAT",
  );
});

test("both completed and skipped advance past the sibling gate", () => {
  // Paired assertion: completed and skipped are equivalent to the resolver.
  for (const siblingInvitation of ["completed", "skipped"]) {
    assert.equal(
      resolveLaunchState({ signedIn: true, consent: "completed", siblingInvitation }),
      "READY_FOR_CHAT",
      `siblingInvitation='${siblingInvitation}' should reach chat`,
    );
  }
});
