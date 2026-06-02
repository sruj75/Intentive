/**
 * Dev Auth Provider — a launch-only sign-in fake. The Auth Adapter exposes it
 * only under `__DEV__` (ADR 0012); it never ships. It reports success so the
 * gate walk and the `markSignedIn` seam can be exercised with no backend, but
 * it holds no real session and yields no **User JWT** — so `restoreSession` is
 * always `false` and `getAccessToken` always `null`.
 */
import type { AuthProvider, SignInOutcome } from "../types/auth.js";

export function createDevAuthProvider(): AuthProvider {
  return {
    signIn: (): Promise<SignInOutcome> => Promise.resolve({ status: "signed-in" }),
    signOut: () => Promise.resolve(),
    restoreSession: () => Promise.resolve(false),
    getAccessToken: () => Promise.resolve(null),
  };
}
