/**
 * The Auth Adapter — the single deep module the Identity Gate calls. It hides
 * provider selection and the **User JWT** behind four methods (ADR 0012).
 *
 * Construction takes the normalized Neon client port, the set of social
 * providers that are a *working* capability, and whether to expose the
 * launch-only dev provider (`__DEV__`). The adapter owns capability honesty: a
 * provider not in `enabled` (or the dev provider when `includeDev` is false)
 * short-circuits to `not-configured` here — never a fake success, and without
 * opening a dead OAuth flow — so the **Auth Providers** themselves stay pure
 * sign-in strategies that only ever run when they should genuinely try. Session,
 * token, and sign-out delegate to the shared Neon client, so cold-launch restore
 * (#23) and the token-getter (#33) always reflect real Neon sessions, never the
 * dev fake.
 */
import type { AuthAdapter, AuthProviderId, SignInOutcome } from "../types/auth.js";
import { noopTelemetry, type Telemetry } from "../../../providers/telemetry/types.js";
import type { NeonAuthClientPort, SocialProvider } from "./ports.js";
import { createDevAuthProvider } from "./dev-provider.js";
import { createNeonAuthProvider } from "./neon-provider.js";

export function createAuthAdapter(deps: {
  client: NeonAuthClientPort;
  enabled: ReadonlySet<SocialProvider>;
  includeDev: boolean;
  telemetry?: Telemetry;
}): AuthAdapter {
  const { client, enabled, includeDev, telemetry = noopTelemetry } = deps;
  const google = createNeonAuthProvider({ client, social: "google" });
  const apple = createNeonAuthProvider({ client, social: "apple" });
  const dev = includeDev ? createDevAuthProvider() : null;

  const captureAuthFailure = (error: unknown, provider?: AuthProviderId) => {
    telemetry.captureException(error, {
      tags: {
        error_type: "auth",
        ...(provider ? { auth_provider: provider } : {}),
      },
    });
  };

  const signIn = async (
    provider: AuthProviderId,
    attempt: () => Promise<SignInOutcome>,
  ): Promise<SignInOutcome> => {
    try {
      const outcome = await attempt();
      if (outcome.status === "error") captureAuthFailure(new Error(outcome.message), provider);
      return outcome;
    } catch (error) {
      captureAuthFailure(error, provider);
      throw error;
    }
  };

  return {
    signIn(provider: AuthProviderId): Promise<SignInOutcome> {
      switch (provider) {
        case "google":
          return signIn(provider, () =>
            enabled.has("google") ? google.signIn() : notConfigured(),
          );
        case "apple":
          return signIn(provider, () => (enabled.has("apple") ? apple.signIn() : notConfigured()));
        case "dev":
          return signIn(provider, () => (dev ? dev.signIn() : notConfigured()));
      }
    },
    signOut: () => client.signOut(),
    restoreSession: () => client.hasSession(),
    async getUserJwt() {
      try {
        return await client.getJwt();
      } catch (error) {
        captureAuthFailure(error);
        throw error;
      }
    },
  };
}

const notConfigured = (): Promise<SignInOutcome> => Promise.resolve({ status: "not-configured" });
