/**
 * The slice of the Neon Auth (Better Auth) client the auth domain depends on,
 * normalized so the provider/adapter logic stays free of SDK and native module types —
 * and therefore runs under the fast node:test path. `service/neon-client.ts`
 * adapts the real SDK into this port; tests pass a fake.
 */
export type SocialProvider = "google" | "apple";

/** Normalized result of one OAuth attempt, emitted by the client boundary. */
export type NeonAttempt =
  | { result: "authenticated" }
  | { result: "dismissed" } // the user closed the OAuth browser
  | { result: "failed"; message: string };

export interface NeonAuthClientPort {
  signInSocial(provider: SocialProvider): Promise<NeonAttempt>;
  hasSession(): Promise<boolean>;
  getJwt(): Promise<string | null>;
  signOut(): Promise<void>;
}
