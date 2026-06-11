import { AuthView, SignedIn, SignedOut, UserButton } from "@neondatabase/neon-js/auth/react/ui";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

type AuthSurface = "settings" | "sign-in";

type Props = {
  surface: AuthSurface;
};

type ConnectionMood =
  | "signed_out"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "needs_attention";

type ConnectionStatus = {
  mood: ConnectionMood;
};

const STATUS_COPY: Record<ConnectionMood, string> = {
  signed_out: "Signed out",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting...",
  needs_attention: "Needs attention",
};

export default function AccountSettingsSurface({ surface }: Props) {
  const [connectionMood, setConnectionMood] = useState<ConnectionMood>("signed_out");

  useEffect(() => {
    let cancelled = false;
    let receivedLive = false;
    let unlisten: (() => void) | undefined;
    void listen<ConnectionStatus>("routing:status", (event) => {
      if (!cancelled) {
        receivedLive = true;
        setConnectionMood(event.payload.mood);
      }
    })
      .then((cleanup) => {
        if (cancelled) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch(() => {
        // Browser preview and Vitest do not host Tauri events.
      });

    // Replay the current status: the Settings window reloads when opened, so a
    // listener alone would miss transitions that already happened. Skip if a
    // live event already arrived so a stale snapshot never overwrites it.
    void invoke<ConnectionStatus>("get_connection_status")
      .then((status) => {
        if (!cancelled && !receivedLive) {
          setConnectionMood(status.mood);
        }
      })
      .catch(() => {
        // No Rust command host under browser preview / Vitest.
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  if (surface === "sign-in") {
    return (
      <main className="settings-shell">
        <section className="settings-section settings-section--intro">
          <h1>Sign In</h1>
          <p>
            Use the same Google identity for your Intentive account. After sign-in, Intentive
            resolves Routing to your Agent Runtime and can begin capturing quietly from the menu
            bar.
          </p>
        </section>
        <section className="settings-section">
          <AuthView />
        </section>
      </main>
    );
  }

  return (
    <main className="settings-shell">
      <section className="settings-section settings-section--intro">
        <h1>Settings</h1>
        <p>
          Intentive runs from the menu bar. Settings keeps account access and quiet app state in one
          place.
        </p>
      </section>

      <section className="settings-section" aria-labelledby="account-heading">
        <div className="settings-section__header">
          <div>
            <h2 id="account-heading">Account</h2>
            <p>
              Google sign-in connects this Mac to your Companion through Routing — no manual
              endpoint or API key.
            </p>
          </div>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
        <SignedOut>
          <AuthView />
        </SignedOut>
      </section>

      <section className="settings-section" aria-labelledby="status-heading">
        <h2 id="status-heading">Status</h2>
        <p>{STATUS_COPY[connectionMood]}</p>
      </section>
    </main>
  );
}
