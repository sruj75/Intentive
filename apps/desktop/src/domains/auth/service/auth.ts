// neon-js is beta and thinly documented; the React adapter wiring (DOM session
// cookies, vs. Expo SecureStore on mobile) is here: https://neon.com/docs/guides/neon-auth
import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthReactAdapter } from "@neondatabase/neon-js/auth/react/adapters";

export const NEON_AUTH_URL_ENV = "VITE_NEON_AUTH_URL";

export function readNeonAuthUrl(
  env: Record<string, string | boolean | undefined> = import.meta.env,
): string {
  const authUrl = env[NEON_AUTH_URL_ENV];

  if (typeof authUrl !== "string" || authUrl.trim() === "") {
    throw new Error(`${NEON_AUTH_URL_ENV} is required to render the Intentive Auth surface.`);
  }

  return authUrl;
}

export function createIntentiveAuthClient(authUrl = readNeonAuthUrl()): unknown {
  return createAuthClient(authUrl, {
    adapter: BetterAuthReactAdapter(),
  });
}
