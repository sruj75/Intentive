/**
 * Identity service — turns a raw bearer token into the Account State skeleton.
 *
 * Composes the two injected collaborators (verify the JWT, then resolve the
 * User) and assembles the `GetMeResponse`. It holds no I/O and no HTTP-status
 * knowledge: a verification failure surfaces as the verifier's typed
 * `JwtVerificationError`, which the HTTP layer maps to a status. That keeps this
 * function pure and trivially testable with fakes.
 */
import type { AccountState } from "@intentive/api-contract";
import type { JwtVerifier } from "@intentive/providers/auth";

import type { UsersRepo } from "../repo/users.js";

export interface IdentityService {
  /**
   * Verify `token` and return the caller's Account State. Rejects with the
   * verifier's `JwtVerificationError` if the token is not valid; never returns a
   * partial or unauthenticated account.
   */
  resolveAccount(token: string): Promise<AccountState>;
}

export function createIdentityService(deps: {
  verifier: JwtVerifier;
  users: UsersRepo;
}): IdentityService {
  return {
    async resolveAccount(token) {
      // The verifier's `user_id` is the IdP *subject* (jose `payload.sub`); the
      // repo maps that to the stable internal user_id we expose to clients.
      const { user_id: sub } = await deps.verifier.verify(token);
      const { userId } = await deps.users.resolveUser({ sub });

      // Placeholders for this slice: `next_gate` is computed in #26 and
      // `has_agent_instance` in #30. Until then the honest skeleton is "no gate
      // pending, no Agent Instance yet". Do not mistake these for real logic.
      return { user_id: userId, next_gate: null, has_agent_instance: false };
    },
  };
}
