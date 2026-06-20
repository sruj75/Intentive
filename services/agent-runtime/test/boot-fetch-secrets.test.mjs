import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchSecretValue,
  loadSecrets,
  parseSecretNames,
  parseSecretSpecs,
} from "../scripts/boot-fetch-secrets.mjs";

test("parseSecretNames accepts comma and whitespace separated allowlists", () => {
  assert.deepEqual(parseSecretNames("NEON_DATABASE_URL, OPENROUTER_API_KEY\nSENTRY_DSN"), [
    "NEON_DATABASE_URL",
    "OPENROUTER_API_KEY",
    "SENTRY_DSN",
  ]);
});

test("parseSecretSpecs supports env-to-secret aliases", () => {
  assert.deepEqual(parseSecretSpecs("SENTRY_DSN=AGENT_RUNTIME_SENTRY_DSN OPENROUTER_API_KEY"), [
    { envName: "SENTRY_DSN", secretName: "AGENT_RUNTIME_SENTRY_DSN" },
    { envName: "OPENROUTER_API_KEY", secretName: "OPENROUTER_API_KEY" },
  ]);
});

test("loadSecrets fetches metadata token once and loads only missing allowlisted env vars", async () => {
  const calls = [];
  const env = {
    GOOGLE_CLOUD_PROJECT: "agentic-accountability",
    SECRET_NAMES: "NEON_DATABASE_URL OPENROUTER_API_KEY",
    OPENROUTER_API_KEY: "already-present",
  };

  const loaded = await loadSecrets({
    env,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (String(url).includes("/instance/service-accounts/default/token")) {
        assert.equal(options.headers["Metadata-Flavor"], "Google");
        return jsonResponse({ access_token: "metadata-token" });
      }
      assert.equal(options.headers.Authorization, "Bearer metadata-token");
      assert.ok(String(url).includes("/secrets/NEON_DATABASE_URL/versions/latest:access"));
      return jsonResponse({
        payload: { data: Buffer.from("postgres://runtime").toString("base64") },
      });
    },
  });

  assert.deepEqual(loaded, ["NEON_DATABASE_URL"]);
  assert.equal(env.NEON_DATABASE_URL, "postgres://runtime");
  assert.equal(env.OPENROUTER_API_KEY, "already-present");
  assert.equal(calls.length, 2);
});

test("loadSecrets maps alias entries to the requested env var", async () => {
  const env = {
    GOOGLE_CLOUD_PROJECT: "agentic-accountability",
    SECRET_NAMES: "SENTRY_DSN=AGENT_RUNTIME_SENTRY_DSN",
  };

  const loaded = await loadSecrets({
    env,
    fetchImpl: async (url) => {
      if (String(url).includes("/instance/service-accounts/default/token")) {
        return jsonResponse({ access_token: "metadata-token" });
      }
      assert.ok(String(url).includes("/secrets/AGENT_RUNTIME_SENTRY_DSN/versions/latest:access"));
      return jsonResponse({
        payload: { data: Buffer.from("https://dsn.example").toString("base64") },
      });
    },
  });

  assert.deepEqual(loaded, ["SENTRY_DSN"]);
  assert.equal(env.SENTRY_DSN, "https://dsn.example");
});

test("loadSecrets is a no-op without SECRET_NAMES", async () => {
  const loaded = await loadSecrets({
    env: {},
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
  });

  assert.deepEqual(loaded, []);
});

test("loadSecrets requires a project id when SECRET_NAMES is set", async () => {
  await assert.rejects(
    () =>
      loadSecrets({
        env: { SECRET_NAMES: "NEON_DATABASE_URL" },
        fetchImpl: async () => jsonResponse({}),
      }),
    /GOOGLE_CLOUD_PROJECT/,
  );
});

test("fetchSecretValue decodes Secret Manager payload data", async () => {
  const value = await fetchSecretValue({
    fetchImpl: async () =>
      jsonResponse({ payload: { data: Buffer.from("secret-value").toString("base64") } }),
    projectId: "project",
    name: "SECRET_NAME",
    token: "token",
  });

  assert.equal(value, "secret-value");
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
