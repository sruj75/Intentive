import test from "node:test";
import assert from "node:assert/strict";

import { z } from "zod";

import { BoundaryParseError, parseBoundary } from "../dist/index.js";

// A strict schema standing in for any inbound contract (HTTP body or WS event).
// Strict so unknown keys are rejected, exercising the unrecognized_keys path.
const schema = z
  .object({
    fingerprint: z.string(),
    nested: z.object({ token: z.string() }),
  })
  .strict();

const valid = { fingerprint: "abc", nested: { token: "secret" } };

test("parseBoundary returns the typed value for valid input", () => {
  const value = parseBoundary(schema, valid);
  assert.equal(value.fingerprint, "abc");
  assert.equal(value.nested.token, "secret");
});

test("parseBoundary throws BoundaryParseError surfacing only key names, never values", () => {
  try {
    parseBoundary(schema, { ...valid, legacy_field: true });
    assert.fail("expected BoundaryParseError");
  } catch (err) {
    assert.ok(err instanceof BoundaryParseError);
    assert.ok(Array.isArray(err.keys));
    assert.ok(err.keys.includes("legacy_field"));
    // The error reports the offending key, never the payload values.
    assert.ok(!err.message.includes("secret"));
  }
});

test("parseBoundary reports nested key paths dot-joined", () => {
  try {
    parseBoundary(schema, { fingerprint: "abc", nested: { token: 42 } });
    assert.fail("expected BoundaryParseError");
  } catch (err) {
    assert.ok(err instanceof BoundaryParseError);
    assert.ok(err.keys.includes("nested.token"));
  }
});

test("parseBoundary labels a root-level type mismatch as (root)", () => {
  try {
    parseBoundary(schema, "not-an-object");
    assert.fail("expected BoundaryParseError");
  } catch (err) {
    assert.ok(err instanceof BoundaryParseError);
    assert.ok(err.keys.includes("(root)"));
  }
});
