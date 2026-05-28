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

export const authClient = createAuthClient(readNeonAuthUrl(), {
  adapter: BetterAuthReactAdapter(),
});
