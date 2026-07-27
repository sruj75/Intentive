import assert from "node:assert/strict";
import test from "node:test";

import { extractModelUsage } from "../dist/index.js";

test("model usage reports provider-supplied OpenRouter credits without estimating from tokens", () => {
  assert.deepEqual(
    extractModelUsage({
      messages: [
        {
          usage_metadata: { input_tokens: 120, output_tokens: 30 },
          response_metadata: { usage: { cost: 0.0042 } },
        },
      ],
    }),
    {
      token_input: 120,
      token_output: 30,
      cost_available: true,
      cost_credits: 0.0042,
    },
  );
});

test("model usage emits an explicit missing-cost signal when provider metadata omits cost", () => {
  assert.deepEqual(
    extractModelUsage({
      messages: [
        {
          usage_metadata: { input_tokens: 120, output_tokens: 30 },
          response_metadata: { usage: {} },
        },
      ],
    }),
    {
      token_input: 120,
      token_output: 30,
      cost_available: false,
    },
  );
  assert.deepEqual(extractModelUsage({ messages: [] }), {
    cost_available: false,
  });
});

test("model usage rejects malformed or negative provider cost instead of fabricating telemetry", () => {
  for (const cost of ["0.0042", -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(
      extractModelUsage({
        messages: [{ response_metadata: { usage: { cost } } }],
      }),
      { cost_available: false },
    );
  }
});
