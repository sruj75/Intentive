import type React from "react";
import { NeonAuthUIProvider } from "@neondatabase/neon-js/auth/react";
import "@neondatabase/neon-js/ui/css";
import { authClient, readNeonAuthUrl } from "../service/auth";

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
