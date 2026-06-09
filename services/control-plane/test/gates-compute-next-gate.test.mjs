/**
 * Pure gate sequencing, the heart of the slice: no I/O, no fakes — just the
 * decision "given this user's recorded state plus the calling device's context,
 * what gate is next?". The order is Consent Primer → Sibling Invitation →
 * (Desktop only) Capture Permission Setup → done (ADR-0005). `identity` is never
 * returned here: the auth boundary owns that gate (ADR-0004), not this function.
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

test("both cross-client gates resolved leaves no gate pending (Mobile, no device signal)", () => {
  assert.equal(computeNextGate({ consentCompleted: true, siblingSkipped: true }), null);
});

test("an observed sibling device resolves the Sibling Invitation without an explicit skip (#21)", () => {
  assert.equal(
    computeNextGate({ consentCompleted: true, siblingSkipped: false, hasSiblingDevice: true }),
    null,
  );
});

test("a Desktop that has not granted capture is gated on Capture Permission Setup", () => {
  assert.equal(
    computeNextGate({
      consentCompleted: true,
      siblingSkipped: true,
      clientKind: "desktop",
      capturePermissionGranted: false,
    }),
    "capture_permission_setup",
  );
});

test("a Desktop that has granted capture has no gate pending", () => {
  assert.equal(
    computeNextGate({
      consentCompleted: true,
      siblingSkipped: true,
      clientKind: "desktop",
      capturePermissionGranted: true,
    }),
    null,
  );
});

test("Mobile never reaches the capture gate even without a grant", () => {
  assert.equal(
    computeNextGate({
      consentCompleted: true,
      siblingSkipped: true,
      clientKind: "mobile",
      capturePermissionGranted: false,
    }),
    null,
  );
});

test("the device-local capture gate is last: an unresolved sibling still comes first on Desktop", () => {
  assert.equal(
    computeNextGate({
      consentCompleted: true,
      siblingSkipped: false,
      clientKind: "desktop",
      capturePermissionGranted: false,
    }),
    "sibling_client_invitation",
  );
});
