import assert from "node:assert/strict";
import test from "node:test";

import { runtimeToClientEvent } from "@intentive/protocol";

import { mapJwtVerificationErrorToRuntimeError } from "../dist/index.js";

const authFailureReasons = [
  "expired",
  "invalid_signature",
  "wrong_issuer",
  "wrong_audience",
  "unknown_key",
  "malformed",
];

test("JWKS outage maps to a retryable runtime_error", () => {
  const event = mapJwtVerificationErrorToRuntimeError({
    reason: "jwks_unavailable",
    message: "JWKS endpoint https://issuer.test/.well-known/jwks.json failed for secret-user-id",
  });

  assert.deepEqual(event, {
    type: "runtime_error",
    code: "service_unavailable",
    message: "Authentication is temporarily unavailable. Please retry shortly.",
  });
  assert.equal(runtimeToClientEvent.safeParse(event).success, true);
});

test("token verification failures map to auth_failed runtime_error", () => {
  for (const reason of authFailureReasons) {
    const event = mapJwtVerificationErrorToRuntimeError({
      reason,
      message: `token secret-token-for-${reason} failed for secret-user-id`,
    });

    assert.deepEqual(event, {
      type: "runtime_error",
      code: "auth_failed",
      message: "Authentication failed.",
    });
    assert.equal(runtimeToClientEvent.safeParse(event).success, true);
  }
});

test("runtime auth errors do not leak token, claim, or provider internals", () => {
  const sensitiveFragments = ["secret-token", "secret-user-id", "issuer.test", "jwks.json"];

  const events = [
    mapJwtVerificationErrorToRuntimeError({
      reason: "jwks_unavailable",
      message: "fetch failed for https://issuer.test/.well-known/jwks.json and secret-token",
    }),
    mapJwtVerificationErrorToRuntimeError({
      reason: "malformed",
      message: "secret-token subject secret-user-id is invalid",
    }),
  ];

  for (const event of events) {
    const serialized = JSON.stringify(event);
    for (const fragment of sensitiveFragments) {
      assert.equal(serialized.includes(fragment), false);
    }
  }
});
