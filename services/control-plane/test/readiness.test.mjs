import assert from "node:assert/strict";
import test from "node:test";

import { createReadiness } from "../dist/http/readiness.js";

test("readiness is ready when Neon and JWKS both pass", async () => {
  const readiness = createReadiness({
    sql: async () => [{ "?column?": 1 }],
    verifier: { probe: async () => {} },
  });

  assert.deepEqual(await readiness.check(), {
    ready: true,
    checks: { neon: "ok", jwks: "ok" },
  });
});

test("readiness reports Neon failure without skipping JWKS", async () => {
  let probed = false;
  const readiness = createReadiness({
    sql: async () => {
      throw new Error("database unavailable");
    },
    verifier: {
      probe: async () => {
        probed = true;
      },
    },
  });

  assert.deepEqual(await readiness.check(), {
    ready: false,
    checks: { neon: "failed", jwks: "ok" },
  });
  assert.equal(probed, true);
});

test("readiness reports JWKS failure without hiding Neon success", async () => {
  const readiness = createReadiness({
    sql: async () => [{ "?column?": 1 }],
    verifier: {
      probe: async () => {
        throw new Error("jwks unavailable");
      },
    },
  });

  assert.deepEqual(await readiness.check(), {
    ready: false,
    checks: { neon: "ok", jwks: "failed" },
  });
});

test("a hung dependency times out as failed instead of stalling /readyz", async () => {
  const hang = () => new Promise(() => {});
  const startedAt = Date.now();
  const readiness = createReadiness({
    sql: async () => [{ "?column?": 1 }],
    verifier: { probe: hang },
    timeoutMs: 25,
  });

  assert.deepEqual(await readiness.check(), {
    ready: false,
    checks: { neon: "ok", jwks: "failed" },
  });
  assert.ok(Date.now() - startedAt < 500, "a hung probe must not block the readiness response");
});
