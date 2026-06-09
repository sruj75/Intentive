/**
 * Identity service — the sole assembler of Account State (ADR-0004).
 *
 * Two responsibilities, kept separate so each is trivially testable:
 *
 *  - `authenticate(token)` is the "what is an authenticated request" decision:
 *    verify the JWT, map the IdP subject to our internal user_id. The HTTP
 *    handlers (`requireUser`) and `resolveAccount` both lean on this so that
 *    decision lives in exactly one place.
 *  - `resolveAccount(token)` composes the `GetMeResponse` by calling each owning
 *    domain for its field — `user_id` from `authenticate` here, `next_gate` from
 *    the injected `gates` port. It owns the wire shape; the domains expose
 *    decisions, not the `/me` response.
 *
 * It holds no I/O and no HTTP-status knowledge: a verification failure surfaces
 * as the verifier's typed `JwtVerificationError`, which the HTTP layer maps to a
 * status. That keeps these functions pure and testable with fakes.
 */
import type { AccountState, PreChatGateKind } from "@intentive/api-contract";
import type { JwtVerifier } from "@intentive/providers/auth";

import type { UsersRepo } from "../repo/users.js";

/**
 * The narrow slice of the gates domain this composer needs: "what gate is next
 * for this user?". Depending on this local port (not the whole `GatesService`)
 * keeps identity decoupled from the gates write surface — identity only reads.
 */
export interface NextGateResolver {
  nextGate(userId: string): Promise<PreChatGateKind | null>;
}

export interface IdentityService {
  /**
   * Verify `token` and resolve the caller to a stable internal user. Rejects
   * with the verifier's `JwtVerificationError` if the token is not valid. This
   * is the single definition of an authenticated request.
   */
  authenticate(token: string): Promise<{ userId: string }>;

  /**
   * Verify `token` and return the caller's full Account State. Rejects with the
   * verifier's `JwtVerificationError` if the token is not valid; never returns a
   * partial or unauthenticated account.
   */
  resolveAccount(token: string): Promise<AccountState>;
}

export function createIdentityService(deps: {
  verifier: JwtVerifier;
  users: UsersRepo;
  gates: NextGateResolver;
}): IdentityService {
  async function authenticate(token: string): Promise<{ userId: string }> {
    // The verifier's `user_id` is the IdP *subject* (jose `payload.sub`); the
    // repo maps that to the stable internal user_id we expose to clients.
    const { user_id: sub } = await deps.verifier.verify(token);
    return deps.users.resolveUser({ sub });
  }

  return {
    authenticate,
    async resolveAccount(token) {
      const { userId } = await authenticate(token);
      const next_gate = await deps.gates.nextGate(userId);

      // `has_agent_instance` stays the honest `false` placeholder until #30 wires
      // the `agents` collaborator. `user_id` and `next_gate` are now real.
      return { user_id: userId, next_gate, has_agent_instance: false };
    },
  };
}
