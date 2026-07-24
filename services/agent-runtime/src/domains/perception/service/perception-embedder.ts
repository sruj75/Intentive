import type { PerceptionEmbedder } from "../types/perception.js";

/**
 * Agent Runtime's default Screen Memory embedder: `openai/text-embedding-3-small`
 * through the existing OpenRouter credentials. Any failure (network, rate limit,
 * unsupported model) resolves to `null` so hybrid search degrades to FTS rather
 * than erroring — the embedder is a recall enhancer, never a hard dependency.
 */
export function createOpenRouterPerceptionEmbedder(params: {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model?: string;
  readonly dim?: number;
  readonly fetchImpl?: typeof fetch;
}): PerceptionEmbedder {
  const model = params.model ?? "openai/text-embedding-3-small";
  const dim = params.dim ?? 1536;
  const doFetch = params.fetchImpl ?? fetch;
  const baseUrl = params.baseUrl.trim();
  const parsedBaseUrl = new URL(baseUrl);
  if (parsedBaseUrl.protocol !== "https:" && parsedBaseUrl.protocol !== "http:") {
    throw new TypeError("Perception embedder base URL must use HTTP or HTTPS");
  }
  let baseUrlEnd = baseUrl.length;
  while (baseUrlEnd > 0 && baseUrl[baseUrlEnd - 1] === "/") {
    baseUrlEnd -= 1;
  }
  const url = `${baseUrl.slice(0, baseUrlEnd)}/embeddings`;

  return {
    modelId: model,
    dim,
    async embed(text) {
      const trimmed = text.trim();
      if (trimmed === "") return null;
      try {
        const response = await doFetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${params.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ model, input: trimmed }),
        });
        if (!response.ok) return null;
        const payload = (await response.json()) as {
          data?: { embedding?: unknown }[];
        };
        const vector = payload.data?.[0]?.embedding;
        if (!Array.isArray(vector) || vector.some((value) => typeof value !== "number")) {
          return null;
        }
        return vector as number[];
      } catch {
        return null;
      }
    },
  };
}

/** A degraded embedder that always yields `null` — search runs FTS-only. */
export const nullPerceptionEmbedder: PerceptionEmbedder = {
  modelId: "none",
  dim: 0,
  embed: async () => null,
};
