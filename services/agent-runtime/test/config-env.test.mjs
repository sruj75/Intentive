import assert from "node:assert/strict";
import test from "node:test";

import { AgentRuntimeConfigError, loadConfig } from "../dist/index.js";

const validEnv = {
  PORT: "9090",
  INTERNAL_PORT: "9091",
  PUBLIC_WS_URL: "wss://runtime.example.com/ws",
  INTERNAL_SECRET_FROM_CONTROL_PLANE: "runtime-inbound-secret",
  NEON_DATABASE_URL: "https://runtime-db.example.com",
  NEON_DATABASE_ROLE: "agent_runtime_writer",
  NEON_AUTH_JWKS_URL: "https://auth.example.com/.well-known/jwks.json",
  NEON_AUTH_ISSUER: "https://auth.example.com",
  NEON_AUTH_AUDIENCE: "intentive-runtime",
};

test("loadConfig returns grouped Agent Runtime config for valid env", () => {
  assert.deepEqual(loadConfig(validEnv), {
    port: 9090,
    internalInbound: { port: 9091, secret: "runtime-inbound-secret" },
    publicWsUrl: "wss://runtime.example.com/ws",
    neon: { url: "https://runtime-db.example.com", role: "agent_runtime_writer" },
    neonAuth: {
      jwksUrl: "https://auth.example.com/.well-known/jwks.json",
      issuer: "https://auth.example.com",
      audience: "intentive-runtime",
    },
  });
});

test("loadConfig applies Agent Runtime boot defaults", () => {
  const {
    PORT: _port,
    INTERNAL_PORT: _internalPort,
    NEON_DATABASE_ROLE: _role,
    ...envWithoutDefaults
  } = validEnv;

  const config = loadConfig(envWithoutDefaults);

  assert.equal(config.port, 8080);
  assert.equal(config.internalInbound.port, 8081);
  assert.equal(config.neon.role, "agent_runtime_app");
});

test("loadConfig names missing required Agent Runtime env keys", () => {
  const { NEON_DATABASE_URL: _databaseUrl, ...envWithoutDatabaseUrl } = validEnv;

  assert.throws(
    () => loadConfig(envWithoutDatabaseUrl),
    (error) => {
      assert.equal(error instanceof AgentRuntimeConfigError, true);
      assert.deepEqual(error.invalidKeys, ["NEON_DATABASE_URL"]);
      return true;
    },
  );
});

test("loadConfig names malformed Agent Runtime env keys", () => {
  assert.throws(
    () => loadConfig({ ...validEnv, PORT: "abc", PUBLIC_WS_URL: "not-a-url" }),
    (error) => {
      assert.equal(error instanceof AgentRuntimeConfigError, true);
      assert.deepEqual(error.invalidKeys, ["PORT", "PUBLIC_WS_URL"]);
      return true;
    },
  );
});

test("loadConfig errors never leak Agent Runtime env values", () => {
  const badSecret = "";
  const badUrl = "postgres-secret-value";

  assert.throws(
    () =>
      loadConfig({
        ...validEnv,
        INTERNAL_SECRET_FROM_CONTROL_PLANE: badSecret,
        NEON_DATABASE_URL: badUrl,
      }),
    (error) => {
      assert.equal(error instanceof AgentRuntimeConfigError, true);
      assert.match(error.message, /INTERNAL_SECRET_FROM_CONTROL_PLANE/);
      assert.match(error.message, /NEON_DATABASE_URL/);
      assert.equal(error.message.includes(badUrl), false);
      return true;
    },
  );
});
