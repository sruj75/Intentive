/**
 * auth domain — the public contract for the Identity Gate's sign-in boundary.
 *
 * The **Auth Adapter** is the single deep module the rest of the Mobile Client
 * sees: it hides the native Google sign-in path and the **User JWT** entirely
 * from the UI. See apps/mobile/docs/adr/0030-mobile-google-only-production-auth.md
 * and apps/mobile/CONTEXT.md (Auth Adapter, User JWT).
 */

/**
 * The result of a sign-in attempt — deliberately token-free, so the Identity Gate
 * learns only whether to advance or stay put. Only `signed-in` advances; every
 * other outcome leaves the user on the gate with the button released for another
 * attempt, and none of them renders anything (ADR 0030, amended 2026-07-26 — the
 * gate's action area does not shift). Failure detail reaches Sentry through the
 * Auth Adapter, not the UI.
 *   - `signed-in`      success; the Identity Gate flips Launch State via `markSignedIn`.
 *   - `cancelled`      the user backed out — NOT an error; return silently.
 *   - `not-configured` Google has no credentials yet (e.g. a build without the public
 *                      client IDs); never reported as a fake success. Production config
 *                      resolution already fails without both client IDs, so this is a
 *                      dev-build state.
 *   - `error`          a recoverable failure; the adapter has already captured it.
 */
export type SignInOutcome =
  | { status: "signed-in" }
  | { status: "cancelled" }
  | { status: "not-configured" }
  | { status: "error" };

/**
 * The boundary the Identity Gate calls. Deep module: four methods over all the
 * SDK / token complexity. `signIn` is Google-only (ADR 0030): it takes no
 * provider argument. `restoreSession` exists for cold-launch hydration and
 * `getUserJwt` for the WebSocket handshake — the UI never calls `getUserJwt`.
 */
export interface AuthAdapter {
  signIn(): Promise<SignInOutcome>;
  signOut(): Promise<void>;
  restoreSession(): Promise<boolean>;
  getUserJwt(): Promise<string | null>;
}
