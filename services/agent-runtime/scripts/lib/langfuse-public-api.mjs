/**
 * Narrow Public API client for Langfuse write bodies that langfuse-cli 0.0.12
 * cannot currently express from its bundled OpenAPI schema. Endpoint and
 * payload shapes follow the official Langfuse Public API.
 */
export function createLangfusePublicApiClient({
  baseUrl,
  publicKey,
  secretKey,
  fetchImpl = fetch,
}) {
  const origin = validatedOrigin(baseUrl);
  const authorization = `Basic ${Buffer.from(`${publicKey}:${secretKey}`, "utf8").toString("base64")}`;

  return Object.freeze({
    getPrompt(name) {
      return request(
        `/api/public/v2/prompts/${encodeURIComponent(name)}?label=production&resolve=false`,
        {
          allowMissing: true,
        },
      );
    },
    createPrompt(body) {
      return request("/api/public/v2/prompts", { body, method: "POST" });
    },
    getDataset(name) {
      return request(`/api/public/v2/datasets/${encodeURIComponent(name)}`, {
        allowMissing: true,
      });
    },
    createDataset(body) {
      return request("/api/public/v2/datasets", { body, method: "POST" });
    },
    getDatasetItem(id) {
      return request(`/api/public/dataset-items/${encodeURIComponent(id)}`, {
        allowMissing: true,
      });
    },
    upsertDatasetItem(body) {
      return request("/api/public/dataset-items", { body, method: "POST" });
    },
  });

  async function request(relativeUrl, options = {}) {
    let response;
    try {
      response = await fetchImpl(new URL(relativeUrl, origin), {
        method: options.method ?? "GET",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: {
          accept: "application/json",
          authorization,
          ...(options.body ? { "content-type": "application/json" } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch {
      throw new LangfusePublicApiError(
        "langfuse_network_error",
        "The Langfuse Public API could not be reached.",
      );
    }

    if (options.allowMissing && response.status === 404) return null;
    if (!response.ok) {
      throw new LangfusePublicApiError(
        "langfuse_http_error",
        `The Langfuse Public API returned HTTP ${response.status}.`,
      );
    }

    try {
      return await response.json();
    } catch {
      throw new LangfusePublicApiError(
        "langfuse_response_invalid",
        "The Langfuse Public API returned an invalid JSON response.",
      );
    }
  }
}

function validatedOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new LangfusePublicApiError(
      "langfuse_configuration_invalid",
      "LANGFUSE_BASE_URL (or LANGFUSE_HOST) must be an absolute URL.",
    );
  }

  const localHost = ["127.0.0.1", "::1", "localhost"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "" && url.pathname !== "/") ||
    (url.protocol !== "https:" && !(localHost && url.protocol === "http:"))
  ) {
    throw new LangfusePublicApiError(
      "langfuse_configuration_invalid",
      "The Langfuse URL must be an HTTPS origin without credentials, a path, a query, or a fragment.",
    );
  }
  return new URL(`${url.origin}/`);
}

export class LangfusePublicApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
