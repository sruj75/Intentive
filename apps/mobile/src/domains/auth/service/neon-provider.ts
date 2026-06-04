/**
 * A Neon Auth-backed sign-in path for one social provider. It owns one piece of
 * knowledge: interpreting an OAuth attempt — a dismissed browser is `cancelled`
 * (not an error), an established session is `signed-in`, anything else is a
 * recoverable `error`.
 *
 * Capability honesty (which providers are a working capability) is the **Auth
 * Adapter**'s: it short-circuits a not-yet-configured provider to
 * `not-configured` before ever constructing this attempt, so this provider is
 * only ever called for a provider that should genuinely try (ADR 0012). It is
 * purely a sign-in strategy — session, token, and sign-out are the adapter's,
 * delegated to the shared client; the **User JWT** never surfaces to the UI.
 */
import type { AuthProvider, SignInOutcome } from "../types/auth.js";
import type { NeonAuthClientPort, SocialProvider } from "./ports.js";

export function createNeonAuthProvider(deps: {
  client: NeonAuthClientPort;
  social: SocialProvider;
}): AuthProvider {
  const { client, social } = deps;
  return {
    async signIn(): Promise<SignInOutcome> {
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
  };
}
