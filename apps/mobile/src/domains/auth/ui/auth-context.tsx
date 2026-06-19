/**
 * Auth context — makes the single Auth Adapter available to the Identity Gate,
 * mirroring `LaunchStateProvider`. The real adapter is wired once at the
 * composition root (`app/_layout.tsx`); UI surfaces consume it through
 * `useAuthAdapter`, and tests inject a fake. The adapter is the only auth
 * surface the UI ever sees — no gate imports an auth SDK.
 */
import { createContext, useContext, type ReactNode } from "react";

import type { AuthAdapter } from "../types/auth";

const AuthAdapterContext = createContext<AuthAdapter | null>(null);

export function AuthAdapterProvider({
  adapter,
  children,
}: {
  adapter: AuthAdapter;
  children: ReactNode;
}): React.JSX.Element {
  return <AuthAdapterContext.Provider value={adapter}>{children}</AuthAdapterContext.Provider>;
}

export function useAuthAdapter(): AuthAdapter {
  const adapter = useContext(AuthAdapterContext);
  if (!adapter) {
    throw new Error("useAuthAdapter must be used within an AuthAdapterProvider");
  }
  return adapter;
}

/**
 * Non-throwing read for composition roots that build their own dependencies and
 * only need the Auth Adapter when it is actually present (the production
 * provider is wired at `app/_layout.tsx`; tests inject their deps directly).
 */
export function useOptionalAuthAdapter(): AuthAdapter | null {
  return useContext(AuthAdapterContext);
}
