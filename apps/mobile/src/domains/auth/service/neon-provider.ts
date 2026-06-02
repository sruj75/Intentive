/**
 * A Neon Auth-backed sign-in path for one social provider. It owns two pieces
 * of knowledge:
 *   1. Capability honesty — if the provider has no credentials configured, it
 *      reports `not-configured` without ever opening an OAuth flow (this is how
 *      Apple behaves until its credentials exist; ADR 0012).
 *   2. Interpreting an OAuth attempt — a dismissed browser is `cancelled` (not
 *      an error), an established session is `signed-in`, anything else is a
 *      recoverable `error`.
 *
 * Session and token operations delegate to the shared client. The **User JWT**
 * never surfaces here as a return value to the UI — only `getAccessToken`
 * (consumed by #33) exposes it.
 */
import type { AuthProvider, SignInOutcome } from "../types/auth.js";
import type { NeonAuthClientPort, SocialProvider } from "./ports.js";

export function createNeonAuthProvider(deps: {
  client: NeonAuthClientPort;
  social: SocialProvider;
  enabled: boolean;
}): AuthProvider {
  const { client, social, enabled } = deps;
  return {
    async signIn(): Promise<SignInOutcome> {
      if (!enabled) return { status: "not-configured" };
      const attempt = await client.signInSocial(social);
      switch (attempt.result) {
        case "authenticated":
          return { status: "signed-in" };
        case "dismissed":
          return { status: "cancelled" };
        case "failed":
          return { status: "error", message: attempt.message };
      }
    },
    signOut: () => client.signOut(),
    restoreSession: () => client.hasSession(),
    getAccessToken: () => client.getJwt(),
  };
}
