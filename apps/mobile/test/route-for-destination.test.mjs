import assert from "node:assert/strict";
import test from "node:test";

import { routeForDestination } from "../dist/domains/onboarding/service/route-for-destination.js";

/**
 * The Launch Route contract: the second half of the launch decision. RESOLVING
 * keeps the splash (no replacement); every concrete Launch Destination maps to its
 * one route path. Paired with resolve-launch-state.test.mjs, this makes the whole
 * launch decision assertable on the pure path — closing the gap the route
 * replacement in the root layout used to leave only to the simulator walk-through.
 *
 * Two-zone topology (ADR 0025): every pre-chat destination lands on `/` (the
 * `(onboarding)` zone, where the collapsed funnel shows the outstanding gate);
 * only READY_FOR_CHAT crosses into `/chat` (the `(main)` zone).
 */

test("RESOLVING stays on the splash (no replacement)", () => {
  assert.deepEqual(routeForDestination("RESOLVING"), { kind: "splash" });
});

const ROUTE_ZONES = {
  SIGNED_OUT: "/",
  MISSING_CONSENT: "/",
  MISSING_ONBOARDING: "/",
  SIBLING_INVITATION_PENDING: "/",
  MISSING_TRIAL: "/",
  READY_FOR_CHAT: "/chat",
};

for (const [destination, zone] of Object.entries(ROUTE_ZONES)) {
  test(`${destination} replaces to ${zone}`, () => {
    assert.deepEqual(routeForDestination(destination), { kind: "replace", zone });
  });
}

test("every pre-chat destination lands on the onboarding zone", () => {
  // The collapse the two-zone re-target encodes: the five pre-chat gates all
  // resolve to `/`, so the onboarding funnel — not a distinct gate route —
  // presents whichever gate is outstanding.
  for (const destination of [
    "SIGNED_OUT",
    "MISSING_CONSENT",
    "MISSING_ONBOARDING",
    "SIBLING_INVITATION_PENDING",
    "MISSING_TRIAL",
  ]) {
    assert.deepEqual(routeForDestination(destination), { kind: "replace", zone: "/" });
  }
});
