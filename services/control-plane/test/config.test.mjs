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
  INTERNAL_SECRET_FOR_MAINTENANCE: "secret-for-maintenance",
  EXPO_ACCESS_TOKEN: "expo-token",
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
  assert.deepEqual(cfg.auth, { mode: "neon", localDevSecret: undefined });
  assert.equal(cfg.runtimeInternal.baseUrl, "https://runtime.internal");
  assert.equal(cfg.runtimeInternal.secretToRuntime, "secret-to-runtime");
  assert.equal(cfg.internalInbound.secretFromRuntime, "secret-from-runtime");
  assert.equal(cfg.internalInbound.secretForMaintenance, "secret-for-maintenance");
  assert.equal(cfg.expo.accessToken, "expo-token");
  assert.equal(cfg.sentry, null);

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
  for (const secret of ["secret-to-runtime", "secret-from-runtime", "secret-for-maintenance"]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("EXPO_ACCESS_TOKEN is optional", () => {
  const { EXPO_ACCESS_TOKEN, ...withoutToken } = validEnv;
  void EXPO_ACCESS_TOKEN;
  assert.equal(loadConfig(withoutToken).expo.accessToken, undefined);
});

test("local-dev auth mode requires and exposes the local signing secret", () => {
  const secret = "local-dev-secret-at-least-thirty-two-bytes";
  const cfg = loadConfig({
    ...validEnv,
    INTENTIVE_AUTH_MODE: "local-dev",
    INTENTIVE_DEV_AUTH_SECRET: secret,
  });

  assert.deepEqual(cfg.auth, { mode: "local-dev", localDevSecret: secret });
});

test("local-dev auth mode without a secret names only the missing key", () => {
  const err = loadErr({ ...validEnv, INTENTIVE_AUTH_MODE: "local-dev" });

  assert.ok(err instanceof ControlPlaneConfigError);
  assert.deepEqual(err.invalidKeys, ["INTENTIVE_DEV_AUTH_SECRET"]);
});

test("SENTRY_DSN enables Sentry config with errors-only as the default mode", () => {
  const cfg = loadConfig({
    ...validEnv,
    SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    SENTRY_ENVIRONMENT: "production",
    SENTRY_RELEASE: "control-plane@abc123",
  });

  assert.deepEqual(cfg.sentry, {
    dsn: "https://public@example.ingest.sentry.io/1",
    environment: "production",
    release: "control-plane@abc123",
    mode: "errors-only",
  });
});

test("SENTRY_MODE accepts the reserved performance mode at config parse time", () => {
  const cfg = loadConfig({
    ...validEnv,
    SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    SENTRY_MODE: "errors-and-performance",
  });

  assert.equal(cfg.sentry.mode, "errors-and-performance");
});
