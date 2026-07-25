import assert from "node:assert/strict";
import test from "node:test";

import { isTransientDbError, retryTransientDb } from "../dist/runtime/db-retry.js";

test("quota-shaped Neon errors are terminal, logged safely, and rethrown unchanged", async () => {
  const quotaError = namedError(
    "NeonDbError",
    "compute time quota exceeded for project sensitive-project",
  );
  quotaError.query = "select secret_value from users";
  const calls = [];
  const sleeps = [];
  const errors = [];

  await assert.rejects(
    retryTransientDb(
      async () => {
        calls.push("called");
        throw quotaError;
      },
      {
        logger: recordingLogger(errors),
        sleep: async (delayMs) => sleeps.push(delayMs),
      },
    ),
    (error) => error === quotaError,
  );

  assert.equal(isTransientDbError(quotaError), false);
  assert.equal(calls.length, 1);
  assert.deepEqual(sleeps, []);
  assert.deepEqual(errors, [
    {
      event: "database.retry_terminal",
      errorName: "NeonResourceExhaustedError",
      errorMessage: "Neon resource exhausted",
      attrs: {
        provider: "neon",
        category: "resource_exhausted",
        retryable: false,
        attempts: 1,
      },
    },
  ]);
  assert.doesNotMatch(JSON.stringify(errors), /sensitive-project|secret_value|select /);
});

test("nested quota exhaustion wins over a generic Neon transport wrapper", async () => {
  const quotaError = new Error("RESOURCE_EXHAUSTED: monthly allowance reached");
  const wrapper = namedError("NeonDbError", "fetch failed");
  wrapper.cause = new AggregateError([namedError("Error", "ETIMEDOUT"), quotaError]);
  let attempts = 0;
  const errors = [];

  await assert.rejects(
    retryTransientDb(
      async () => {
        attempts += 1;
        throw wrapper;
      },
      { logger: recordingLogger(errors), sleep: async () => assert.fail("must not sleep") },
    ),
    (error) => error === wrapper,
  );

  assert.equal(isTransientDbError(wrapper), false);
  assert.equal(attempts, 1);
  assert.equal(errors.length, 1);
  assert.deepEqual(errors[0].attrs, {
    provider: "neon",
    category: "resource_exhausted",
    retryable: false,
    attempts: 1,
  });
});

test("transient transport errors retry with the existing linear backoff and can recover", async () => {
  const errors = [
    Object.assign(new Error("socket failed"), { code: "ETIMEDOUT" }),
    Object.assign(new Error("route failed"), { code: "EHOSTUNREACH" }),
    new TypeError("fetch failed"),
    new AggregateError([new Error("nested fetch failed")], "connection failed"),
  ];
  const sleeps = [];
  let attempts = 0;

  const result = await retryTransientDb(
    async () => {
      const error = errors[attempts];
      attempts += 1;
      if (error) throw error;
      return "recovered";
    },
    { sleep: async (delayMs) => sleeps.push(delayMs) },
  );

  assert.equal(result, "recovered");
  assert.equal(attempts, 5);
  assert.deepEqual(sleeps, [500, 1000, 1500, 2000]);
});

test("transient failures stop after five attempts and rethrow the final error unchanged", async () => {
  const failures = Array.from({ length: 5 }, (_, index) =>
    namedError("NeonDbError", `connection failure ${index + 1}`),
  );
  const sleeps = [];
  let attempts = 0;

  await assert.rejects(
    retryTransientDb(
      async () => {
        const error = failures[attempts];
        attempts += 1;
        throw error;
      },
      { sleep: async (delayMs) => sleeps.push(delayMs) },
    ),
    (error) => error === failures[4],
  );

  assert.equal(attempts, 5);
  assert.deepEqual(sleeps, [500, 1000, 1500, 2000]);
});

test("ordinary SQL and application errors execute once without terminal quota logging", async () => {
  for (const error of [
    Object.assign(new Error("duplicate key"), { code: "23505" }),
    Object.assign(namedError("NeonDbError", "duplicate key violates unique constraint"), {
      code: "23505",
    }),
    new Error("application invariant failed"),
  ]) {
    let attempts = 0;
    const errors = [];

    await assert.rejects(
      retryTransientDb(
        async () => {
          attempts += 1;
          throw error;
        },
        { logger: recordingLogger(errors), sleep: async () => assert.fail("must not sleep") },
      ),
      (thrown) => thrown === error,
    );

    assert.equal(attempts, 1);
    assert.deepEqual(errors, []);
  }
});

function namedError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function recordingLogger(errors) {
  return {
    info: () => {},
    warn: () => {},
    error: (event, error, attrs) =>
      errors.push({
        event,
        errorName: error?.name,
        errorMessage: error?.message,
        attrs,
      }),
    child: () => recordingLogger(errors),
  };
}
