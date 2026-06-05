import assert from "node:assert/strict";
import test from "node:test";

import { routeForDestination } from "../dist/domains/onboarding/service/route-for-destination.js";

/**
 * The Launch Route contract: the second half of the launch decision. RESOLVING
 * keeps the splash (no replacement); every concrete Launch Destination maps to its
 * one route zone. Paired with resolve-launch-state.test.mjs, this makes the whole
 * launch decision assertable on the pure path — closing the gap the route
 * replacement in the root layout used to leave only to the simulator walk-through.
 */

test("RESOLVING stays on the splash (no replacement)", () => {
  assert.deepEqual(routeForDestination("RESOLVING"), { kind: "splash" });
});

const ROUTE_ZONES = {
  SIGNED_OUT: "/(gates)/identity",
  MISSING_CONSENT: "/(gates)/consent",
  SIBLING_INVITATION_PENDING: "/(gates)/invite",
  READY_FOR_CHAT: "/(chat)",
};

for (const [destination, zone] of Object.entries(ROUTE_ZONES)) {
  test(`${destination} replaces to ${zone}`, () => {
    assert.deepEqual(routeForDestination(destination), { kind: "replace", zone });
  });
}
