/**
 * The Auth Adapter — the single deep module the Identity Gate calls. It owns the
 * Google-only sign-in path and the **User JWT** behind four methods (ADR 0012,
 * ADR 0030).
 *
 * Construction takes the normalized Neon client port, whether Google is a
 * *working* capability (both public client IDs present), and telemetry. The
 * adapter owns capability honesty: when `googleAuthConfigured` is false it
 * short-circuits to `not-configured` — never a fake success, and without
 * opening a dead OAuth flow. A dismissed native prompt is `cancelled` (not an
 * error); an established session is `signed-in`; anything else is a recoverable
 * `error`. Session, token, and sign-out delegate to the shared Neon client, so
 * cold-launch restore and the token-getter always reflect a real Neon session.
 */
import type { AuthAdapter, SignInOutcome } from "../types/auth.js";
import { noopTelemetry, type Telemetry } from "../../../providers/telemetry/types.js";
import type { NeonAuthClientPort, NeonAttempt } from "./ports.js";

export function createAuthAdapter(deps: {
  client: NeonAuthClientPort;
  googleAuthConfigured: boolean;
  telemetry?: Telemetry;
}): AuthAdapter {
  const { client, googleAuthConfigured, telemetry = noopTelemetry } = deps;

  const captureAuthFailure = (error: unknown) => {
    telemetry.captureException(error, { tags: { error_type: "auth", auth_provider: "google" } });
  };

  const interpret = (attempt: NeonAttempt): SignInOutcome => {
    switch (attempt.result) {
      case "authenticated":
        return { status: "signed-in" };
      case "dismissed":
        return { status: "cancelled" };
      case "failed":
        captureAuthFailure(new Error(attempt.message));
        return { status: "error", message: attempt.message };
    }
  };

  return {
    async signIn(): Promise<SignInOutcome> {
      if (!googleAuthConfigured) return { status: "not-configured" };
      try {
        return interpret(await client.signInWithGoogle());
      } catch (error) {
        captureAuthFailure(error);
        throw error;
      }
    },
    async signOut(): Promise<void> {
      try {
        await client.signOut();
      } catch (error) {
        captureAuthFailure(error);
        throw error;
      }
    },
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
