import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig, ControlPlaneConfigError } from "../dist/index.js";

const validEnv = {
  PORT: "9090",
  NEON_DATABASE_URL: "postgres://user:pass@host/db",
  NEON_DATABASE_ROLE: "control_plane_app",
  NEON_AUTH_JWKS_URL: "https://issuer.test/.well-known/jwks.json",
  NEON_AUTH_ISSUER: "https://issuer.test",
  NEON_AUTH_AUDIENCE: "intentive",
  RUNTIME_INTERNAL_BASE_URL: "https://runtime.internal",
  INTERNAL_SECRET_TO_RUNTIME: "secret-to-runtime",
  INTERNAL_SECRET_FROM_RUNTIME: "secret-from-runtime",
  APNS_KEY_ID: "KEYID",
  APNS_TEAM_ID: "TEAMID",
  APNS_BUNDLE_ID: "com.intentive.app",
  APNS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----stub-----END PRIVATE KEY-----",
};

function loadErr(env) {
  try {
    loadConfig(env);
  } catch (err) {
    return err;
  }
  return null;
}

test("valid env loads into a grouped, frozen config", () => {
  const cfg = loadConfig(validEnv);

  assert.equal(cfg.port, 9090);
  assert.equal(cfg.neon.role, "control_plane_app");
  assert.equal(cfg.neonAuth.audience, "intentive");
  assert.equal(cfg.runtimeInternal.baseUrl, "https://runtime.internal");
  assert.equal(cfg.runtimeInternal.secretToRuntime, "secret-to-runtime");
  assert.equal(cfg.internalInbound.secretFromRuntime, "secret-from-runtime");
  assert.equal(cfg.apns.bundleId, "com.intentive.app");

  // frozen — config is read-only once resolved
  assert.throws(() => {
    cfg.port = 1;
  });
});

test("NEON_DATABASE_ROLE defaults to control_plane_app when omitted", () => {
  const { NEON_DATABASE_ROLE, ...withoutRole } = validEnv;
  void NEON_DATABASE_ROLE;
  assert.equal(loadConfig(withoutRole).neon.role, "control_plane_app");
});

test("a missing required var throws with the offending key named", () => {
  const { NEON_AUTH_ISSUER, ...partial } = validEnv;
  void NEON_AUTH_ISSUER;
  const err = loadErr(partial);
  assert.ok(err instanceof ControlPlaneConfigError);
  assert.ok(err.invalidKeys.includes("NEON_AUTH_ISSUER"));
});

test("a malformed URL throws with the offending key named", () => {
  const err = loadErr({ ...validEnv, NEON_DATABASE_URL: "not-a-url" });
  assert.ok(err instanceof ControlPlaneConfigError);
  assert.ok(err.invalidKeys.includes("NEON_DATABASE_URL"));
});

test("config errors never echo a secret value", () => {
  const err = loadErr({ ...validEnv, RUNTIME_INTERNAL_BASE_URL: "not-a-url" });
  const serialized = `${err.message} ${JSON.stringify(err.invalidKeys)}`;
  for (const secret of ["secret-to-runtime", "secret-from-runtime", "BEGIN PRIVATE KEY"]) {
    assert.equal(serialized.includes(secret), false);
  }
});
