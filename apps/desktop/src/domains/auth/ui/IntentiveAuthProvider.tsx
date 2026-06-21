import type React from "react";
import { useEffect, useMemo } from "react";
import { NeonAuthUIProvider } from "@neondatabase/neon-js/auth/react";
import "@neondatabase/neon-js/ui/css"; // Neon's default auth form styles
import {
  createIntentiveAuthClient,
  readNeonAuthUrl,
  syncLoginTokenToRust,
  type LoginTokenSyncState,
} from "../service/auth";
import { CaptureRateLimiter, captureException } from "../../../providers/observability";

const LOGIN_TOKEN_SYNC_FAILURE = "auth.login_token_sync";
const LOGIN_TOKEN_SYNC_FAILURE_CAPTURE_COOLDOWN_MS = 30 * 60 * 1_000;

type Props = {
  children: React.ReactNode;
};

type IntentiveAuthProviderProps = {
  authClient: unknown;
  baseURL?: string;
  redirectTo?: string;
  credentials: false;
  social: { providers: ["google"] };
  children: React.ReactNode;
};

const Provider = NeonAuthUIProvider as React.ComponentType<IntentiveAuthProviderProps>;

export default function IntentiveAuthProvider({ children }: Props) {
  const authUrl = readNeonAuthUrl();
  const authClient = useMemo(() => createIntentiveAuthClient(authUrl), [authUrl]);

  useEffect(() => {
    let cancelled = false;
    let synced: LoginTokenSyncState = { kind: "unknown" };
    const failureCaptureLimiter = new CaptureRateLimiter<string>(
      LOGIN_TOKEN_SYNC_FAILURE_CAPTURE_COOLDOWN_MS,
    );
    const sync = () => {
      if (cancelled) return;
      void syncLoginTokenToRust(authClient, synced)
        .then((next) => {
          if (!cancelled) synced = next;
        })
        .catch((error: unknown) => {
          // Browser preview and tests do not have a Rust command host. The app
          // retries on focus and on the interval once it is running under Tauri.
          if (failureCaptureLimiter.shouldCapture(LOGIN_TOKEN_SYNC_FAILURE)) {
            captureException(error);
          }
        });
    };

    sync();
    window.addEventListener("focus", sync);
    const interval = window.setInterval(sync, 5_000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", sync);
      window.clearInterval(interval);
    };
  }, [authClient]);

  return (
    <Provider
      authClient={authClient}
      baseURL={authUrl}
      redirectTo={authUrl}
      credentials={false}
      social={{ providers: ["google"] }}
    >
      {children}
    </Provider>
  );
}
