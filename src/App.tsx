import { useMemo } from "react";
import "./App.css";

type Surface = "settings" | "sign-in";

function resolveSurface(): Surface {
  const params = new URLSearchParams(window.location.search);
  return params.get("surface") === "sign-in" ? "sign-in" : "settings";
}

function App() {
  const surface = useMemo(resolveSurface, []);

  if (surface === "sign-in") {
    return (
      <main className="container">
        <h1>Sign In</h1>
        <p>
          By signing in, you agree that Intentive will start a Capture Session
          automatically each time you launch it. Activity is summarized
          on-device; only the summary is sent to your OpenClaw Agent.
        </p>
        <p>
          <em>Auth provider is not yet wired (Issue #3 ships the menu bar shell
          only). The real sign-in flow will replace this placeholder.</em>
        </p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>Settings</h1>
      <p>
        Auth, OpenClaw Agent endpoint, and capture preferences will live here.
        This placeholder ships with the menu bar shell (Issue #3).
      </p>
    </main>
  );
}

export default App;
