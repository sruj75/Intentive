import type {
  PostInternalSessionsStartRequest,
  PostInternalSessionsStartResponse,
} from "@intentive/api-contract";

import type { AgentInstanceRegistry } from "../repo/instance-registry.js";

export type StartSession = (
  request: PostInternalSessionsStartRequest,
) => Promise<PostInternalSessionsStartResponse>;

export function createStartSession(deps: {
  registry: AgentInstanceRegistry;
  wsUrl: string;
}): StartSession {
  return async (request) => {
    const instance = await deps.registry.loadOrCreate(request.user_id);
    return {
      agent_instance_id: instance.id,
      ws_url: deps.wsUrl,
    };
  };
}
