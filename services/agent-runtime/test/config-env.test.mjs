import assert from "node:assert/strict";
import test from "node:test";

import { AgentRuntimeConfigError, loadConfig } from "../dist/index.js";

const validEnv = {
  PORT: "9090",
  INTERNAL_PORT: "9091",
  PUBLIC_WS_URL: "wss://runtime.example.com/ws",
  INTERNAL_SECRET_FROM_CONTROL_PLANE: "runtime-inbound-secret",
  CONTROL_PLANE_INTERNAL_BASE_URL: "https://control-plane.internal",
  INTERNAL_SECRET_TO_CONTROL_PLANE: "runtime-outbound-secret",
  NEON_DATABASE_URL: "https://runtime-db.example.com",
  NEON_DATABASE_ROLE: "agent_runtime_writer",
  NEON_AUTH_JWKS_URL: "https://auth.example.com/.well-known/jwks.json",
  NEON_AUTH_ISSUER: "https://auth.example.com",
  NEON_AUTH_AUDIENCE: "intentive-runtime",
  OPENROUTER_API_KEY: "openrouter-secret",
};

test("loadConfig returns grouped Agent Runtime config for valid env", () => {
  assert.deepEqual(loadConfig(validEnv), {
    port: 9090,
    internalInbound: { port: 9091, secret: "runtime-inbound-secret" },
    controlPlane: {
      baseUrl: "https://control-plane.internal",
      internalSecret: "runtime-outbound-secret",
    },
    publicWsUrl: "wss://runtime.example.com/ws",
    neon: { url: "https://runtime-db.example.com", role: "agent_runtime_writer" },
    neonAuth: {
      jwksUrl: "https://auth.example.com/.well-known/jwks.json",
      issuer: "https://auth.example.com",
      audience: "intentive-runtime",
    },
    model: {
      apiKey: "openrouter-secret",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    },
    langfuse: null,
    sentry: null,
  });
});

test("loadConfig applies Agent Runtime boot defaults", () => {
  const {
    PORT: _port,
    INTERNAL_PORT: _internalPort,
    NEON_DATABASE_ROLE: _role,
    OPENROUTER_BASE_URL: _baseUrl,
    RUNTIME_MODEL: _model,
    ...envWithoutDefaults
  } = validEnv;

  const config = loadConfig(envWithoutDefaults);

  assert.equal(config.port, 8080);
  assert.equal(config.internalInbound.port, 8081);
  assert.equal(config.neon.role, "agent_runtime_app");
  assert.equal(config.model.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(config.model.model, "nvidia/nemotron-3-ultra-550b-a55b:free");
  assert.equal(config.langfuse, null);
  assert.equal(config.sentry, null);
});

test("loadConfig accepts model, Langfuse, and Sentry overrides", () => {
  const config = loadConfig({
    ...validEnv,
    OPENROUTER_BASE_URL: "https://openrouter.example.com/v1",
    RUNTIME_MODEL: "openai/gpt-test",
    LANGFUSE_PUBLIC_KEY: "pk-test",
    LANGFUSE_SECRET_KEY: "sk-test",
    LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
    SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    SENTRY_ENVIRONMENT: "staging",
    SENTRY_RELEASE: "agent-runtime@abc123",
  });

  assert.deepEqual(config.model, {
    apiKey: "openrouter-secret",
    baseUrl: "https://openrouter.example.com/v1",
    model: "openai/gpt-test",
  });
  assert.deepEqual(config.langfuse, {
    publicKey: "pk-test",
    secretKey: "sk-test",
    baseUrl: "https://cloud.langfuse.com",
    mode: "callback",
  });
  assert.deepEqual(config.sentry, {
    dsn: "https://public@example.ingest.sentry.io/1",
    environment: "staging",
    release: "agent-runtime@abc123",
    mode: "errors-only",
  });
});

test("loadConfig parses reserved observability modes", () => {
  const config = loadConfig({
    ...validEnv,
    LANGFUSE_PUBLIC_KEY: "pk-test",
    LANGFUSE_SECRET_KEY: "sk-test",
    LANGFUSE_MODE: "otel",
    SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    SENTRY_MODE: "errors-and-performance",
  });

  assert.equal(config.langfuse.mode, "otel");
  assert.equal(config.sentry.mode, "errors-and-performance");
});

test("loadConfig names malformed Sentry config keys without values", () => {
  const badDsn = "not-a-dsn";

  assert.throws(
    () => loadConfig({ ...validEnv, SENTRY_DSN: badDsn }),
    (error) => {
      assert.equal(error instanceof AgentRuntimeConfigError, true);
      assert.deepEqual(error.invalidKeys, ["SENTRY_DSN"]);
      assert.equal(error.message.includes(badDsn), false);
      return true;
    },
  );
});

test("loadConfig names invalid observability mode keys", () => {
  let thrown;
  try {
    loadConfig({
      ...validEnv,
      SENTRY_MODE: "performance",
      LANGFUSE_MODE: "trace-all",
    });
  } catch (error) {
    thrown = error;
  }

  assert.equal(thrown instanceof AgentRuntimeConfigError, true);
  assert.deepEqual(thrown.invalidKeys, ["LANGFUSE_MODE", "SENTRY_MODE"]);
});

test("loadConfig names missing required Agent Runtime env keys", () => {
  const {
    NEON_DATABASE_URL: _databaseUrl,
    CONTROL_PLANE_INTERNAL_BASE_URL: _controlPlaneBaseUrl,
    OPENROUTER_API_KEY: _openRouterApiKey,
    ...envWithoutRequiredKeys
  } = validEnv;

  assert.throws(
    () => loadConfig(envWithoutRequiredKeys),
    (error) => {
      assert.equal(error instanceof AgentRuntimeConfigError, true);
      assert.deepEqual(error.invalidKeys, [
        "CONTROL_PLANE_INTERNAL_BASE_URL",
        "NEON_DATABASE_URL",
        "OPENROUTER_API_KEY",
      ]);
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
      assert.equal(error.message.includes(validEnv.OPENROUTER_API_KEY), false);
      return true;
    },
  );
});
