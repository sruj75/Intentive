import { CompositeBackend, StateBackend, StoreBackend, type AnyBackendProtocol } from "deepagents";
import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

import type { UserMemoryStore } from "../types/store.js";

export function createMemoryBackend(params: { readonly store: unknown }): {
  readonly backend: CompositeBackend;
} {
  return createAgentBackend(params);
}

export function createAgentBackend(params: {
  readonly store: unknown;
  readonly cronBackend?: AnyBackendProtocol;
}): {
  readonly backend: CompositeBackend;
} {
  const routes: Record<string, AnyBackendProtocol> = {
    "/memories/": new StoreBackend({
      store: params.store as never,
      namespace: ({ config }) => ["memories", userIdFromConfig(config?.configurable)],
    }),
  };
  if (params.cronBackend) {
    routes["/crons/"] = params.cronBackend;
  }

  return {
    backend: new CompositeBackend(new StateBackend(), routes),
  };
}

export async function readUserProfile(
  store: UserMemoryStore,
  userId: string,
  logger: Logger = createNoopLogger(),
): Promise<string> {
  const startedAt = Date.now();
  try {
    const item = await store.get(userMemoryNamespace(userId), "/USER.md");
    const content = item?.value.content;

    logger.info("memory.read", {
      user_id: userId,
      status: "ok",
      duration_ms: Date.now() - startedAt,
    });
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content.join("\n");
    }
    return "";
  } catch (error) {
    logger.error("memory.read", error, {
      user_id: userId,
      status: "failed",
      duration_ms: Date.now() - startedAt,
    });
    throw error;
  }
}

export function userMemoryNamespace(userId: string): string[] {
  return ["memories", userId];
}

function userIdFromConfig(configurable: Record<string, unknown> | undefined): string {
  const userId = configurable?.user_id;
  if (typeof userId === "string" && userId.length > 0) {
    return userId;
  }
  throw new Error("DeepAgents memory namespace requires configurable.user_id.");
}
