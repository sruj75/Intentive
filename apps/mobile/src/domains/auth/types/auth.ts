/**
 * auth domain — the public contract for the Identity Gate's sign-in boundary.
 *
 * The **Auth Adapter** is the single deep module the rest of the Mobile Client
 * sees: it hides which **Auth Provider** answered (Neon Auth Google/Apple, or
 * the dev provider) and hides the **User JWT** entirely from the UI. See
 * apps/mobile/docs/adr/0012-mobile-auth-adapter-with-dev-provider.md and
 * apps/mobile/CONTEXT.md (Auth Adapter, Auth Provider, User JWT).
 */

/** Which sign-in path the user picked. `dev` is `__DEV__`-only (a launch fake). */
export type AuthProviderId = "google" | "apple" | "dev";

/**
 * The result of a sign-in attempt — deliberately token-free, so the screen
 * learns only whether to advance, retry, or explain:
 *   - `signed-in`      success; the screen flips Launch State via `markSignedIn`.
 *   - `cancelled`      the user backed out — NOT an error; return silently.
 *   - `not-configured` the provider has no credentials yet (e.g. Apple today);
 *                      surfaced honestly, never as a fake success.
 *   - `error`          a recoverable failure; the gate offers a retry.
 */
export type SignInOutcome =
  | { status: "signed-in" }
  | { status: "cancelled" }
  | { status: "not-configured" }
  | { status: "error"; message: string };

/**
 * The boundary the Identity Gate calls. Deep module: four methods over all the
 * SDK / provider / token complexity. `restoreSession` exists for #23
 * (cold-launch hydration) and `getAccessToken` for #33 (the WebSocket
 * handshake) — neither is wired in #19, and the UI never calls
 * `getAccessToken`.
 */
export interface AuthAdapter {
  signIn(provider: AuthProviderId): Promise<SignInOutcome>;
  signOut(): Promise<void>;
  restoreSession(): Promise<boolean>;
  getAccessToken(): Promise<string | null>;
}

/**
 * One concrete sign-in path behind the **Auth Adapter** — same shape minus
 * provider selection, which the adapter owns. The dev provider holds no real
 * session, so its `restoreSession` is always `false` and `getAccessToken`
 * always `null`.
 */
export interface AuthProvider {
  signIn(): Promise<SignInOutcome>;
  signOut(): Promise<void>;
  restoreSession(): Promise<boolean>;
  getAccessToken(): Promise<string | null>;
}
