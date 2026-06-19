/**
 * `src/http/auth.ts` — the one definition of "this HTTP request is an
 * authenticated user". Pins the bearer-token parse, the failure→status mapping
 * (including the now-single canonical 503 body), and `requireUser`'s branches:
 * no token, success, mapped verifier failures, and a non-auth rethrow.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { JwtVerificationError } from "@intentive/providers/auth";

import {
  authErrorResponse,
  authFailed,
  bearerToken,
  mapJwtVerificationErrorToHttpResponse,
  requireInternalSecret,
  requireUser,
  serviceUnavailable,
} from "../dist/http/auth.js";

test("bearerToken extracts the token, case-insensitively and trimmed", () => {
  assert.equal(bearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(bearerToken("  bearer token123  "), "token123");
});

test("bearerToken returns null for absent or non-bearer credentials", () => {
  assert.equal(bearerToken(null), null);
  assert.equal(bearerToken(""), null);
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken("Bearer "), null);
});

test("authFailed is the canonical 401 body", () => {
  assert.deepEqual(authFailed(), {
    status: 401,
    body: { code: "auth_failed", message: "Authentication failed." },
  });
});

test("serviceUnavailable is the single canonical 503 body", () => {
  assert.deepEqual(serviceUnavailable(), {
    status: 503,
    body: {
      code: "service_unavailable",
      message: "Authentication is temporarily unavailable. Please retry shortly.",
    },
  });
});

test("mapJwtVerificationErrorToHttpResponse: JWKS outage → 503, everything else → 401", () => {
  assert.deepEqual(
    mapJwtVerificationErrorToHttpResponse({ reason: "jwks_unavailable" }),
    serviceUnavailable(),
  );
  for (const reason of ["expired", "invalid_signature", "wrong_issuer", "malformed"]) {
    assert.deepEqual(mapJwtVerificationErrorToHttpResponse({ reason }), authFailed());
  }
});

test("authErrorResponse maps a JwtVerificationError and returns null otherwise", () => {
  assert.deepEqual(
    authErrorResponse(new JwtVerificationError("jwks_unavailable", "down")),
    serviceUnavailable(),
  );
  assert.deepEqual(authErrorResponse(new JwtVerificationError("expired", "old")), authFailed());
  assert.equal(authErrorResponse(new Error("boom")), null);
});

test("requireUser: a missing Authorization header → 401, never calls the authenticator", async () => {
  let called = false;
  const result = await requireUser(null, {
    authenticate: async () => {
      called = true;
      return { userId: "u1" };
    },
  });

  assert.equal(called, false);
  assert.deepEqual(result, { ok: false, response: authFailed() });
});

test("requireUser: a valid token resolves to the userId", async () => {
  const result = await requireUser("Bearer good", {
    authenticate: async (token) => {
      assert.equal(token, "good");
      return { userId: "user-42" };
    },
  });

  assert.deepEqual(result, { ok: true, userId: "user-42" });
});

test("requireUser: a verifier failure maps to its auth response", async () => {
  const expired = await requireUser("Bearer stale", {
    authenticate: async () => {
      throw new JwtVerificationError("expired", "token expired");
    },
  });
  assert.deepEqual(expired, { ok: false, response: authFailed() });

  const jwksDown = await requireUser("Bearer any", {
    authenticate: async () => {
      throw new JwtVerificationError("jwks_unavailable", "jwks down");
    },
  });
  assert.deepEqual(jwksDown, { ok: false, response: serviceUnavailable() });
});

test("requireUser: a non-auth error rethrows rather than becoming a 401/503", async () => {
  await assert.rejects(
    requireUser("Bearer any", {
      authenticate: async () => {
        throw new Error("database is on fire");
      },
    }),
    /database is on fire/,
  );
});

test("requireInternalSecret validates bearer credentials against the expected secret", () => {
  assert.deepEqual(requireInternalSecret("Bearer expected", "expected"), { authenticated: true });
  assert.deepEqual(requireInternalSecret(null, "expected"), {
    authenticated: false,
    response: authFailed(),
  });
  assert.deepEqual(requireInternalSecret("Bearer wrong", "expected"), {
    authenticated: false,
    response: authFailed(),
  });
});
