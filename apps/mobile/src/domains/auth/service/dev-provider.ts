/**
 * Dev Auth Provider — a launch-only sign-in fake. The Auth Adapter exposes it
 * only under `__DEV__` (ADR 0012); it never ships. It reports success so the
 * gate walk and the `markSignedIn` seam can be exercised with no backend. It
 * holds no real session and yields no **User JWT**: session/token/sign-out are
 * the Auth Adapter's, served by the real Neon client, never this fake — so a
 * dev sign-in cannot masquerade as a restorable session.
 */
import type { AuthProvider, SignInOutcome } from "../types/auth.js";

export function createDevAuthProvider(): AuthProvider {
  return {
    signIn: (): Promise<SignInOutcome> => Promise.resolve({ status: "signed-in" }),
  };
}
