import { CompositeBackend, StateBackend, StoreBackend } from "deepagents";

import type { UserMemoryStore } from "../types/store.js";

export function createMemoryBackend(params: { readonly store: unknown }): {
  readonly backend: CompositeBackend;
} {
  return {
    backend: new CompositeBackend(new StateBackend(), {
      "/memories/": new StoreBackend({
        store: params.store as never,
        namespace: ({ config }) => ["memories", userIdFromConfig(config?.configurable)],
      }),
    }),
  };
}

export async function readUserProfile(store: UserMemoryStore, userId: string): Promise<string> {
  const item = await store.get(userMemoryNamespace(userId), "/USER.md");
  const content = item?.value.content;

  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.join("\n");
  }
  return "";
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
