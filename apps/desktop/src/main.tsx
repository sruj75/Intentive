import React from "react";
import ReactDOM from "react-dom/client";
import { NeonAuthUIProvider } from "@neondatabase/neon-js/auth/react";
import "@neondatabase/neon-js/ui/css";
import App from "./App";
import { authClient } from "./auth";

type IntentiveAuthProviderProps = {
  authClient: unknown;
  credentials: false;
  social: { providers: ["google"] };
  children: React.ReactNode;
};

const IntentiveAuthProvider = NeonAuthUIProvider as React.ComponentType<IntentiveAuthProviderProps>;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <IntentiveAuthProvider
      authClient={authClient}
      credentials={false}
      social={{ providers: ["google"] }}
    >
      <App />
    </IntentiveAuthProvider>
  </React.StrictMode>,
);
