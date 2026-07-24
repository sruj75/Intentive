import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";

import { createOpenRouterPerceptionEmbedder } from "../dist/index.js";

test("perception embedder preserves the configured path when joining the endpoint", async () => {
  for (const baseUrl of [
    "https://openrouter.ai/api/v1",
    "https://openrouter.ai/api/v1/",
    "https://openrouter.ai/api/v1///",
  ]) {
    let requestedUrl;
    const embedder = createOpenRouterPerceptionEmbedder({
      apiKey: "test-key",
      baseUrl,
      fetchImpl: async (url) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }), {
          headers: { "content-type": "application/json" },
        });
      },
    });

    assert.deepEqual(await embedder.embed("screen context"), [1, 2, 3]);
    assert.equal(requestedUrl, "https://openrouter.ai/api/v1/embeddings");
  }
});

test("perception embedder URL joining stays linear for slash-heavy configuration", () => {
  const baseUrl = `https://openrouter.ai/api/v1/${"/".repeat(50_000)}x`;
  const startedAt = performance.now();

  createOpenRouterPerceptionEmbedder({ apiKey: "test-key", baseUrl });

  assert.ok(
    performance.now() - startedAt < 500,
    "URL construction must not backtrack polynomially on slash-heavy input",
  );
});

test("perception embedder rejects empty, malformed, and non-HTTP base URLs", () => {
  for (const baseUrl of ["", "not a URL", "file:///tmp/openrouter"]) {
    assert.throws(
      () => createOpenRouterPerceptionEmbedder({ apiKey: "test-key", baseUrl }),
      /URL|HTTP/,
    );
  }
});
