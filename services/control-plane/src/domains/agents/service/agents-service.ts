/**
 * Agents service — owner of Agent Instance Registry truth and the Session Start
 * call.
 *
 * A deep service behind a two-method interface that hides which collaborator
 * answers what: `ensureAgentInstance` is the idempotent get-or-create — it asks
 * the Agent Runtime to start the session (the Runtime is itself idempotent, so a
 * repeat returns the same instance), records the instance locally, and returns
 * the Runtime's live identity; `hasAgentInstance` is the cheap local read the
 * `/me` composer leans on.
 *
 * The two I/O ports are injected (`SessionStarter` for the Runtime boundary,
 * `AgentInstancesRepo` for the SQL), so this composition is unit-testable with
 * fakes and the only mocked thing is the boundary itself. A Runtime failure
 * surfaces unchanged as the starter's `AgentRuntimeUnavailableError` — this
 * service adds no status knowledge; Routing maps it.
 */
import type { AgentInstancesRepo } from "../repo/agent-instances.js";
import type { SessionStarter } from "../repo/runtime-session-start.js";

export interface AgentsService {
  /**
   * Idempotent get-or-create: call the Runtime's Session Start, persist the
   * returned instance for `userId`, and return the Runtime's identity. Throws
   * `AgentRuntimeUnavailableError` when the Runtime can't be reached, answers
   * non-2xx, or returns a body that doesn't match the contract. On that throw
   * nothing is recorded — `has_agent_instance` only flips on a real session.
   */
  ensureAgentInstance(input: {
    userId: string;
    authSubject: string;
  }): Promise<{ agentInstanceId: string; wsUrl: string }>;

  /** Whether `userId` has ever provisioned a Companion (local read). */
  hasAgentInstance(userId: string): Promise<boolean>;
}

export function createAgentsService(deps: {
  sessionStarter: SessionStarter;
  instances: AgentInstancesRepo;
}): AgentsService {
  return {
    async ensureAgentInstance({ userId, authSubject }) {
      // Always call Session Start (never cache `ws_url`): the Runtime owns its
      // own address, so the live call is the source of truth for where to
      // connect. If it throws, we record nothing and let the error propagate.
      const identity = await deps.sessionStarter.startSession({ userId, authSubject });
      await deps.instances.recordInstance({
        userId,
        agentInstanceId: identity.agentInstanceId,
      });
      return identity;
    },

    hasAgentInstance(userId) {
      return deps.instances.hasInstance(userId);
    },
  };
}
