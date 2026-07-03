import assert from "node:assert/strict";
import test from "node:test";

import { resolveLaunchState } from "../dist/domains/onboarding/service/resolve-launch-state.js";

/**
 * The contract for the Launch State Resolver. These tests ARE the specification
 * the gate screens build against: the happy paths plus the cases that encode the
 * design decisions (RESOLVING, the signed-out short-circuit, and skip-vs-completed
 * both advancing). Gate order (each null short-circuits to RESOLVING):
 *
 *   SIGNED_OUT → MISSING_CONSENT → MISSING_ONBOARDING
 *              → SIBLING_INVITATION_PENDING → MISSING_TRIAL → READY_FOR_CHAT
 */

// --- happy paths -----------------------------------------------------------

test("signed out → SIGNED_OUT", () => {
  assert.equal(
    resolveLaunchState({
      signedIn: false,
      consent: "pending",
      onboarding: "pending",
      siblingInvitation: "pending",
      trial: "pending",
    }),
    "SIGNED_OUT",
  );
});

test("signed in, consent pending → MISSING_CONSENT", () => {
  assert.equal(
    resolveLaunchState({
      signedIn: true,
      consent: "pending",
      onboarding: "pending",
      siblingInvitation: "pending",
      trial: "pending",
    }),
    "MISSING_CONSENT",
  );
});

test("consent done, onboarding pending → MISSING_ONBOARDING", () => {
  assert.equal(
    resolveLaunchState({
      signedIn: true,
      consent: "completed",
      onboarding: "pending",
      siblingInvitation: "pending",
      trial: "pending",
    }),
    "MISSING_ONBOARDING",
  );
});

test("onboarding done, sibling pending → SIBLING_INVITATION_PENDING", () => {
  assert.equal(
    resolveLaunchState({
      signedIn: true,
      consent: "completed",
      onboarding: "completed",
      siblingInvitation: "pending",
      trial: "pending",
    }),
    "SIBLING_INVITATION_PENDING",
  );
});

test("sibling done, trial pending → MISSING_TRIAL", () => {
  assert.equal(
    resolveLaunchState({
      signedIn: true,
      consent: "completed",
      onboarding: "completed",
      siblingInvitation: "completed",
      trial: "pending",
    }),
    "MISSING_TRIAL",
  );
});

test("all gates done → READY_FOR_CHAT", () => {
  assert.equal(
    resolveLaunchState({
      signedIn: true,
      consent: "completed",
      onboarding: "completed",
      siblingInvitation: "completed",
      trial: "completed",
    }),
    "READY_FOR_CHAT",
  );
});

// --- design-encoding cases -------------------------------------------------

test("everything unknown (cold start) → RESOLVING", () => {
  assert.equal(
    resolveLaunchState({
      signedIn: null,
      consent: null,
      onboarding: null,
      siblingInvitation: null,
      trial: null,
    }),
    "RESOLVING",
  );
});

test("signed in but gates not yet loaded → RESOLVING", () => {
  assert.equal(
    resolveLaunchState({
      signedIn: true,
      consent: null,
      onboarding: null,
      siblingInvitation: null,
      trial: null,
    }),
    "RESOLVING",
  );
});

test("consent done but onboarding unknown → RESOLVING", () => {
  assert.equal(
    resolveLaunchState({
      signedIn: true,
      consent: "completed",
      onboarding: null,
      siblingInvitation: null,
      trial: null,
    }),
    "RESOLVING",
  );
});

test("sibling done but trial unknown → RESOLVING", () => {
  assert.equal(
    resolveLaunchState({
      signedIn: true,
      consent: "completed",
      onboarding: "completed",
      siblingInvitation: "completed",
      trial: null,
    }),
    "RESOLVING",
  );
});

test("signed out short-circuits past unknown gates → SIGNED_OUT (not RESOLVING)", () => {
  // Proves we evaluate in order and stop: a signed-out user never waits on
  // GET /me, which can't even be called without a session.
  assert.equal(
    resolveLaunchState({
      signedIn: false,
      consent: null,
      onboarding: null,
      siblingInvitation: null,
      trial: null,
    }),
    "SIGNED_OUT",
  );
});

test("sibling skipped advances → MISSING_TRIAL (skip ≠ pending)", () => {
  assert.equal(
    resolveLaunchState({
      signedIn: true,
      consent: "completed",
      onboarding: "completed",
      siblingInvitation: "skipped",
      trial: "pending",
    }),
    "MISSING_TRIAL",
  );
});

test("both completed and skipped advance past the sibling gate", () => {
  // Paired assertion: completed and skipped are equivalent to the resolver.
  for (const siblingInvitation of ["completed", "skipped"]) {
    assert.equal(
      resolveLaunchState({
        signedIn: true,
        consent: "completed",
        onboarding: "completed",
        siblingInvitation,
        trial: "completed",
      }),
      "READY_FOR_CHAT",
      `siblingInvitation='${siblingInvitation}' should reach chat`,
    );
  }
});
