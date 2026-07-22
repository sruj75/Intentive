/**
 * Neon Auth boundary — the ONE native-SDK-importing file in the auth domain, and
 * the single sanctioned seam to the sign-in SDK for the whole Mobile Client (ADR
 * 0012, CONTEXT.md → Auth Adapter / Auth Provider). Product code never imports an
 * auth SDK directly: the UI reaches sign-in only through the **Auth Adapter**,
 * which depends on the RN-free `NeonAuthClientPort` this file alone implements —
 * so this *is* the provider seam, just expressed as the auth domain's own deep
 * boundary rather than a shared package. It does NOT belong in
 * `packages/providers/`: that package holds the cross-deployable, server-side
 * JWKS *verify* concern (`packages/providers/src/auth.ts`, used by the Control
 * Plane and Agent Runtime); this is the RN-native, Mobile-only sign-in client and
 * cannot run server-side. It adapts Better Auth's native client path (SecureStore
 * cookies + deep-link OAuth) into the port the provider and adapter depend on.
 * Because this file imports native Mobile Client modules, it is excluded from
 * the pure-core node:test build (tsconfig.build.json) and lives on the RN axis.
 *
 * The client points at the Neon Auth base URL, whose Better Auth server is the
 * same one whose JWKS backs the shared verifier (#15). Mobile uses Better Auth
 * directly (not neon-js's React-DOM adapter the Desktop Client uses) because
 * the Expo plugin owns SecureStore session persistence. Google authentication
 * is native and reaches Better Auth through its idToken branch; the `intentive`
 * scheme remains for the app's general deep-link surface.
 *
 * The native path differs from BetterAuth's web SDK; its setup gotchas (native
 * client configuration and session persistence) live in the Expo guide:
 * https://better-auth.com/docs/integrations/expo
 */
import { expoClient } from "@better-auth/expo/client";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { createAuthClient } from "better-auth/client";
import * as SecureStore from "expo-secure-store";

import type { NeonAttempt, NeonAuthClientPort, SocialProvider } from "./ports.js";

/** Read from app config; the Neon Auth base URL is a public endpoint. */
const NEON_AUTH_BASE_URL = process.env.EXPO_PUBLIC_NEON_AUTH_BASE_URL ?? "";

function createClient() {
  return createAuthClient({
    baseURL: NEON_AUTH_BASE_URL,
    plugins: [
      expoClient({
        scheme: "intentive", // matches app.json → enables the OAuth deep-link return
        storagePrefix: "intentive",
        storage: SecureStore,
      }),
    ],
  });
}

/**
 * Build the real `NeonAuthClientPort`. Session/token persistence is owned by
 * the Better Auth native plugin (SecureStore) — the Mobile Client hand-rolls none of it.
 */
export function createNeonAuthClient(options: { googleIosClientId: string }): NeonAuthClientPort {
  const client = createClient();
  const googleIosClientId = options.googleIosClientId.trim();
  let googleConfigurationError: string | null = null;

  // Native auth initialization belongs here, behind the Auth Adapter's
  // platform boundary. A missing public client ID leaves Google unconfigured.
  if (googleIosClientId) {
    try {
      GoogleSignin.configure({ iosClientId: googleIosClientId });
    } catch (error) {
      googleConfigurationError =
        error instanceof Error ? error.message : "Google configuration failed.";
    }
  }

  return {
    async signInSocial(provider: SocialProvider): Promise<NeonAttempt> {
      // This boundary always *returns* a NeonAttempt — never throws — so the
      // provider/adapter chain stays a pure outcome map. SDK/network throws are
      // collapsed into `failed` here, the same recoverable shape as a returned error.
      try {
        if (provider !== "google") {
          return { result: "failed", message: "Apple sign-in is not configured." };
        }
        if (!googleIosClientId) {
          return { result: "failed", message: "Google sign-in is not configured." };
        }
        if (googleConfigurationError) {
          return { result: "failed", message: googleConfigurationError };
        }

        const response = await GoogleSignin.signIn();
        if (!isSuccessResponse(response)) {
          return { result: "dismissed" };
        }

        const tokens = await GoogleSignin.getTokens();
        if (!tokens.idToken) {
          return { result: "failed", message: "Google did not return an ID token." };
        }

        const { error } = await client.signIn.social({
          provider: "google",
          idToken: {
            token: tokens.idToken,
            accessToken: tokens.accessToken,
          },
        });
        if (error) {
          return { result: "failed", message: error.message ?? "Sign-in failed." };
        }

        const session = await client.getSession();
        return session.data
          ? { result: "authenticated" }
          : { result: "failed", message: "Google sign-in did not establish a session." };
      } catch (err) {
        return {
          result: "failed",
          message: err instanceof Error ? err.message : "Sign-in failed.",
        };
      }
    },

    async hasSession(): Promise<boolean> {
      const session = await client.getSession();
      return session.data != null;
    },

    async getJwt(): Promise<string | null> {
      // The Neon Auth server exposes the Better Auth JWT plugin's token route;
      // its JWKS is the one #15 verifies. #33 consumes this for the WS handshake.
      // JWT plugin setup + /token endpoint: https://www.better-auth.com/docs/plugins/jwt#retrieve-the-token
      try {
        const res = await client.$fetch<{ token: string }>("/token");
        return res.data?.token ?? null;
      } catch {
        return null;
      }
    },

    async signOut(): Promise<void> {
      await client.signOut();
    },
  };
}
