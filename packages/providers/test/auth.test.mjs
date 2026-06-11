import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { SignJWT, exportJWK, generateKeyPair } from "jose";

import { asJwtVerificationFailure, createJwtVerifier, JwtVerificationError } from "../dist/auth.js";

// --- Fake JWKS endpoint -----------------------------------------------------
//
// These tests exercise the verifier through its real fetch path: a throwaway
// HTTP server publishes a JWKS the verifier downloads, and we mint tokens with
// the matching private key. The HTTP endpoint is the only thing mocked — the
// system boundary — so the tests stay coupled to behavior, not internals.

const ALG = "ES256";
const ISSUER = "https://issuer.test/auth";
const AUDIENCE = "https://issuer.test/auth";

let keyCounter = 0;

// A signing key plus the public JWK a JWKS endpoint would publish for it.
async function makeKey() {
  const { publicKey, privateKey } = await generateKeyPair(ALG, { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: `key-${++keyCounter}`, alg: ALG, use: "sig" };
  return { privateKey, jwk };
}

// A JWKS server whose published key set can be swapped at runtime to simulate
// rotation. `requests` counts fetches so a test can prove a refetch happened.
async function startJwksServer(initialKeys) {
  const state = { keys: initialKeys, requests: 0 };
  const server = createServer((_req, res) => {
    state.requests += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: state.keys.map((k) => k.jwk) }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/jwks`,
    rotateTo: (keys) => {
      state.keys = keys;
    },
    get requests() {
      return state.requests;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function signToken(
  key,
  { sub = "user-123", iss = ISSUER, aud = AUDIENCE, expSeconds = 3600 } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG, kid: key.jwk.kid })
    .setSubject(sub)
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt(now)
    .setExpirationTime(now + expSeconds)
    .sign(key.privateKey);
}

// --- Tracer bullet ----------------------------------------------------------

test("verify resolves the user_id from a valid token's sub claim", async () => {
  const key = await makeKey();
  const jwks = await startJwksServer([key]);
  try {
    const verifier = createJwtVerifier({ jwks_url: jwks.url, issuer: ISSUER, audience: AUDIENCE });
    const principal = await verifier.verify(await signToken(key, { sub: "user-abc" }));
    assert.deepEqual(principal, { user_id: "user-abc" });
  } finally {
    await jwks.close();
  }
});

// --- Error taxonomy ---------------------------------------------------------
//
// Each test asserts the `reason` a given failure maps to. Callers depend on
// `reason`, so this is the behavior that must stay stable across refactors.

// Asserts `verify(token)` rejects with a JwtVerificationError of the given reason.
async function expectReason(verifier, token, reason) {
  await assert.rejects(
    () => verifier.verify(token),
    (err) => {
      assert.ok(err instanceof JwtVerificationError, `expected JwtVerificationError, got ${err}`);
      assert.equal(err.reason, reason);
      return true;
    },
  );
}

test("expired token → reason 'expired'", async () => {
  const key = await makeKey();
  const jwks = await startJwksServer([key]);
  try {
    const verifier = createJwtVerifier({ jwks_url: jwks.url, issuer: ISSUER, audience: AUDIENCE });
    await expectReason(verifier, await signToken(key, { expSeconds: -10 }), "expired");
  } finally {
    await jwks.close();
  }
});

test("wrong issuer → reason 'wrong_issuer'", async () => {
  const key = await makeKey();
  const jwks = await startJwksServer([key]);
  try {
    const verifier = createJwtVerifier({ jwks_url: jwks.url, issuer: ISSUER, audience: AUDIENCE });
    await expectReason(
      verifier,
      await signToken(key, { iss: "https://evil.test/auth" }),
      "wrong_issuer",
    );
  } finally {
    await jwks.close();
  }
});

test("wrong audience → reason 'wrong_audience'", async () => {
  const key = await makeKey();
  const jwks = await startJwksServer([key]);
  try {
    const verifier = createJwtVerifier({ jwks_url: jwks.url, issuer: ISSUER, audience: AUDIENCE });
    await expectReason(
      verifier,
      await signToken(key, { aud: "https://other.test/auth" }),
      "wrong_audience",
    );
  } finally {
    await jwks.close();
  }
});

test("signature signed by a different key → reason 'invalid_signature'", async () => {
  const served = await makeKey();
  // An impostor key that advertises the served key's `kid` but signs with its
  // own private key — the lookup succeeds, the signature check does not.
  const impostor = await makeKey();
  impostor.jwk.kid = served.jwk.kid;
  const jwks = await startJwksServer([served]);
  try {
    const verifier = createJwtVerifier({ jwks_url: jwks.url, issuer: ISSUER, audience: AUDIENCE });
    await expectReason(verifier, await signToken(impostor), "invalid_signature");
  } finally {
    await jwks.close();
  }
});

test("token kid absent from the JWKS → reason 'unknown_key'", async () => {
  const served = await makeKey();
  const unseen = await makeKey();
  const jwks = await startJwksServer([served]);
  try {
    const verifier = createJwtVerifier(
      { jwks_url: jwks.url, issuer: ISSUER, audience: AUDIENCE },
      { cooldownDurationMs: 0 },
    );
    await expectReason(verifier, await signToken(unseen), "unknown_key");
  } finally {
    await jwks.close();
  }
});

test("unknown kid triggers a JWKS refetch that picks up a rotated key", async () => {
  const oldKey = await makeKey();
  const newKey = await makeKey();
  const jwks = await startJwksServer([oldKey]);
  try {
    const verifier = createJwtVerifier(
      { jwks_url: jwks.url, issuer: ISSUER, audience: AUDIENCE },
      { cooldownDurationMs: 0 },
    );

    // Warm the cache with the old key.
    await verifier.verify(await signToken(oldKey));
    const requestsAfterWarmup = jwks.requests;

    // Rotate the published key set; the new token's kid is unknown to the cache.
    jwks.rotateTo([newKey]);
    const principal = await verifier.verify(await signToken(newKey, { sub: "rotated-user" }));

    assert.deepEqual(principal, { user_id: "rotated-user" });
    assert.ok(jwks.requests > requestsAfterWarmup, "expected a refetch on the unknown kid");
  } finally {
    await jwks.close();
  }
});

test("garbage string → reason 'malformed'", async () => {
  const key = await makeKey();
  const jwks = await startJwksServer([key]);
  try {
    const verifier = createJwtVerifier({ jwks_url: jwks.url, issuer: ISSUER, audience: AUDIENCE });
    await expectReason(verifier, "this.is.not-a-jwt", "malformed");
  } finally {
    await jwks.close();
  }
});

test("JWKS fetch failure → reason 'jwks_unavailable'", async () => {
  const verifier = createJwtVerifier({
    jwks_url: "http://127.0.0.1:65530/jwks",
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const token =
    "eyJhbGciOiJSUzI1NiIsImtpZCI6ImtleS0xIn0.eyJzdWIiOiJ1c2VyLTEiLCJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0L2F1dGgiLCJhdWQiOiJodHRwczovL2lzc3Vlci50ZXN0L2F1dGgifQ.signature";

  await expectReason(verifier, token, "jwks_unavailable");
});

// --- Recovering the failure from a caught error -----------------------------
//
// `asJwtVerificationFailure` is the sanctioned way callers turn a caught
// `unknown` back into a `{ reason }`. It owns the taxonomy so callers stop
// re-enumerating it.

test("asJwtVerificationFailure round-trips every JwtVerificationError reason", () => {
  const reasons = [
    "expired",
    "invalid_signature",
    "wrong_issuer",
    "wrong_audience",
    "unknown_key",
    "jwks_unavailable",
    "malformed",
  ];
  for (const reason of reasons) {
    const failure = asJwtVerificationFailure(new JwtVerificationError(reason, "msg"));
    assert.equal(failure.reason, reason);
  }
});

test("asJwtVerificationFailure maps opaque/unknown errors to jwks_unavailable", () => {
  assert.equal(asJwtVerificationFailure(new Error("boom")).reason, "jwks_unavailable");
  assert.equal(asJwtVerificationFailure({ reason: "expired" }).reason, "jwks_unavailable");
  assert.equal(asJwtVerificationFailure(undefined).reason, "jwks_unavailable");
});

test("error message leaks neither the token nor any claim", async () => {
  const key = await makeKey();
  const jwks = await startJwksServer([key]);
  try {
    const verifier = createJwtVerifier({ jwks_url: jwks.url, issuer: ISSUER, audience: AUDIENCE });
    const token = await signToken(key, { sub: "secret-user-id", expSeconds: -10 });
    await assert.rejects(
      () => verifier.verify(token),
      (err) => {
        assert.ok(err instanceof JwtVerificationError);
        assert.ok(!err.message.includes(token), "message must not contain the token");
        assert.ok(!err.message.includes("secret-user-id"), "message must not contain claims");
        return true;
      },
    );
  } finally {
    await jwks.close();
  }
});
