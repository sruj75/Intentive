import assert from "node:assert/strict";
import test from "node:test";

import { mapJwtVerificationErrorToHttpResponse } from "../dist/index.js";

const authFailureReasons = [
  "expired",
  "invalid_signature",
  "wrong_issuer",
  "wrong_audience",
  "unknown_key",
  "malformed",
];

test("JWKS outage maps to a retryable 503 response", () => {
  const response = mapJwtVerificationErrorToHttpResponse({
    reason: "jwks_unavailable",
    message: "JWKS endpoint https://issuer.test/.well-known/jwks.json failed for secret-user-id",
  });

  assert.deepEqual(response, {
    status: 503,
    body: {
      code: "service_unavailable",
      message: "Authentication is temporarily unavailable. Please retry shortly.",
    },
  });
});

test("token verification failures map to structured 401 responses", () => {
  for (const reason of authFailureReasons) {
    const response = mapJwtVerificationErrorToHttpResponse({
      reason,
      message: `token secret-token-for-${reason} failed for secret-user-id`,
    });

    assert.deepEqual(response, {
      status: 401,
      body: {
        code: "auth_failed",
        message: "Authentication failed.",
      },
    });
  }
});

test("auth error responses do not leak token, claim, or provider internals", () => {
  const sensitiveFragments = ["secret-token", "secret-user-id", "issuer.test", "jwks.json"];

  const responses = [
    mapJwtVerificationErrorToHttpResponse({
      reason: "jwks_unavailable",
      message: "fetch failed for https://issuer.test/.well-known/jwks.json and secret-token",
    }),
    mapJwtVerificationErrorToHttpResponse({
      reason: "malformed",
      message: "secret-token subject secret-user-id is invalid",
    }),
  ];

  for (const response of responses) {
    const serialized = JSON.stringify(response);
    for (const fragment of sensitiveFragments) {
      assert.equal(serialized.includes(fragment), false);
    }
  }
});
