/**
 * The Auth Adapter — the single deep module the Identity Gate calls. It hides
 * provider selection and the **User JWT** behind four methods (ADR 0012).
 *
 * Construction takes the normalized Neon client port, the set of social
 * providers that actually have credentials (capability honesty — an absent
 * provider yields `not-configured`, never a fake success), and whether to
 * expose the launch-only dev provider (`__DEV__`). Session, token, and
 * sign-out delegate to the shared Neon client, so cold-launch restore (#23)
 * and the token-getter (#33) always reflect real Neon sessions, never the dev
 * fake.
 */
import type { AuthAdapter, AuthProviderId, SignInOutcome } from "../types/auth.js";
import type { NeonAuthClientPort, SocialProvider } from "./ports.js";
import { createDevAuthProvider } from "./dev-provider.js";
import { createNeonAuthProvider } from "./neon-provider.js";

export function createAuthAdapter(deps: {
  client: NeonAuthClientPort;
  enabled: ReadonlySet<SocialProvider>;
  includeDev: boolean;
}): AuthAdapter {
  const { client, enabled, includeDev } = deps;
  const google = createNeonAuthProvider({
    client,
    social: "google",
    enabled: enabled.has("google"),
  });
  const apple = createNeonAuthProvider({ client, social: "apple", enabled: enabled.has("apple") });
  const dev = includeDev ? createDevAuthProvider() : null;

  return {
    signIn(provider: AuthProviderId): Promise<SignInOutcome> {
      switch (provider) {
        case "google":
          return google.signIn();
        case "apple":
          return apple.signIn();
        case "dev":
          return dev ? dev.signIn() : Promise.resolve({ status: "not-configured" });
      }
    },
    signOut: () => client.signOut(),
    restoreSession: () => client.hasSession(),
    getAccessToken: () => client.getJwt(),
  };
}
