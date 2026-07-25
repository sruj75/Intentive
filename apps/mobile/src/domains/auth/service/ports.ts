/**
 * The slice of the Neon Auth (Better Auth) client the auth domain depends on,
 * normalized so the adapter logic stays free of SDK and native module types —
 * and therefore runs under the fast node:test path. `service/neon-client.ts`
 * adapts the real SDK into this port; tests pass a fake.
 */

/** Normalized result of one Google OAuth attempt, emitted by the client boundary. */
export type NeonAttempt =
  | { result: "authenticated" }
  | { result: "dismissed" } // the user closed the OAuth browser
  | { result: "failed"; message: string };

export interface NeonAuthClientPort {
  /** The Google-specific, parameterless native sign-in operation (ADR 0030). */
  signInWithGoogle(): Promise<NeonAttempt>;
  hasSession(): Promise<boolean>;
  getJwt(): Promise<string | null>;
  signOut(): Promise<void>;
}
