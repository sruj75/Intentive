// neon-js is beta and thinly documented; the React adapter wiring (DOM session
// cookies, vs. Expo SecureStore on mobile) is here: https://neon.com/docs/guides/neon-auth
import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthReactAdapter } from "@neondatabase/neon-js/auth/react/adapters";
import { invoke } from "@tauri-apps/api/core";

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

type SessionReadResult =
  | { kind: "unsupported" }
  | { kind: "signed_out" }
  | { kind: "signed_in"; token: string };

type SessionReader = {
  getSession?: () => Promise<unknown> | unknown;
};

const TOKEN_PATHS = [
  ["data", "session", "token"],
  ["data", "session", "accessToken"],
  ["data", "session", "access_token"],
  ["data", "token"],
  ["data", "accessToken"],
  ["data", "access_token"],
  ["session", "token"],
  ["session", "accessToken"],
  ["session", "access_token"],
  ["token"],
  ["accessToken"],
  ["access_token"],
] as const;

export async function readLoginTokenFromAuthClient(
  authClient: unknown,
): Promise<SessionReadResult> {
  if (!hasSessionReader(authClient)) {
    return { kind: "unsupported" };
  }

  const session = await authClient.getSession();
  const token = extractStringAtPaths(session, TOKEN_PATHS);
  return token === null ? { kind: "signed_out" } : { kind: "signed_in", token };
}

export type LoginTokenSyncState =
  | { kind: "unknown" }
  | { kind: "signed_in"; token: string }
  | { kind: "signed_out" };

// Hands the current Neon login token to Rust, but only when it actually
// changed since the last sync. The webview polls this every few seconds and on
// focus; firing `set_login_token` with an unchanged token would be redundant
// IPC (and, before the Rust-side guard, would tear down the live session).
// Pass the returned state back in on the next call to dedupe.
export async function syncLoginTokenToRust(
  authClient: unknown,
  previous: LoginTokenSyncState = { kind: "unknown" },
): Promise<LoginTokenSyncState> {
  const result = await readLoginTokenFromAuthClient(authClient);
  if (result.kind === "signed_in") {
    if (previous.kind === "signed_in" && previous.token === result.token) {
      return previous;
    }
    await invoke("set_login_token", { token: result.token });
    return { kind: "signed_in", token: result.token };
  }
  if (result.kind === "signed_out") {
    if (previous.kind === "signed_out") {
      return previous;
    }
    await invoke("clear_login_token");
    return { kind: "signed_out" };
  }
  // Unsupported host (browser preview / tests without a Rust command host):
  // leave the synced state unchanged so the next attempt still fires.
  return previous;
}

function hasSessionReader(value: unknown): value is SessionReader & Required<SessionReader> {
  return (
    typeof value === "object" &&
    value !== null &&
    "getSession" in value &&
    typeof (value as SessionReader).getSession === "function"
  );
}

function extractStringAtPaths(
  value: unknown,
  paths: readonly (readonly string[])[],
): string | null {
  for (const path of paths) {
    let current = value;
    for (const key of path) {
      if (typeof current !== "object" || current === null || !(key in current)) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[key];
    }
    if (typeof current === "string" && current.trim() !== "") {
      return current;
    }
  }
  return null;
}
