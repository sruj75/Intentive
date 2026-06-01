import { AuthView, SignedIn, SignedOut, UserButton } from "@neondatabase/neon-js/auth/react/ui";

type AuthSurface = "settings" | "sign-in";

type Props = {
  surface: AuthSurface;
};

export default function AccountSettingsSurface({ surface }: Props) {
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
        <p>Intentive is not capturing.</p>
      </section>
    </main>
  );
}
