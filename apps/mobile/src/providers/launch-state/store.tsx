/**
 * Launch State store — the single in-memory holder of the client's Launch State,
 * shared across domains via React context. It lives under `src/providers/`
 * (not a domain) because both `auth` (Identity Gate) and `onboarding`
 * (Consent / Sibling) write to it; a store inside one domain would be a
 * cross-domain import.
 *
 * Roles, kept separate (see apps/mobile/docs/adr/0011-*):
 *   - read path:  `LaunchStateSource` hydrates the store on mount.
 *   - write path: gate completion calls a mutator, which updates the store
 *                 OPTIMISTICALLY (instant Launch Route transition). The durable POST to the
 *                 Control Plane is a later concern (#23/#26).
 *
 * Nothing is persisted to disk. Cold launch starts UNKNOWN (→ RESOLVING).
 * The resolver reads only this store; it never reads the source directly.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { GateStatus, LaunchState } from "./types";
import type { LaunchStateSource } from "./source";

const UNKNOWN: LaunchState = { signedIn: null, consent: null, siblingInvitation: null };

// Hydration-failure signed-out fallback. `null` gates are safe here: the user
// can only leave this state by signing in, and `markSignedIn` heals any unknown
// gate to `pending` so the resolver always has concrete values to walk forward
// (see markSignedIn). The signed-out short-circuit hides the gates until then.
const HYDRATION_FAILURE_FALLBACK: LaunchState = {
  signedIn: false,
  consent: null,
  siblingInvitation: null,
};

/**
 * Apply an optimistic sign-in. Beyond flipping `signedIn`, this defaults any gate
 * still `null` to `"pending"`: a signed-in state with a `null` gate the resolver
 * needs maps to `RESOLVING` (splash) with no re-read to recover — stranding the
 * user. Pre-seeding `pending` guarantees the resolver can advance to the next
 * gate. This is the one place that owns the walk-safety invariant, so no producer
 * of `LaunchState` (the hydration fallback, the #23 `GET /me` mapper) has to.
 */
function withSignedIn(state: LaunchState): LaunchState {
  return {
    signedIn: true,
    consent: state.consent ?? "pending",
    siblingInvitation: state.siblingInvitation ?? "pending",
  };
}

export interface LaunchStateStore {
  state: LaunchState;
  /** Identity Gate completed (optimistic). */
  markSignedIn: () => void;
  /** Account Surface logout completed; keep known gate progress for same-session re-login. */
  markSignedOut: () => void;
  /** Consent Primer answered (optimistic). */
  setConsent: (status: GateStatus) => void;
  /** Sibling Client Invitation answered — `completed` or `skipped` (optimistic). */
  setSiblingInvitation: (status: GateStatus) => void;
}

const LaunchStateContext = createContext<LaunchStateStore | null>(null);

export function LaunchStateProvider({
  source,
  children,
}: {
  source: LaunchStateSource;
  children: ReactNode;
}): React.JSX.Element {
  const [state, setState] = useState<LaunchState>(UNKNOWN);

  // Read path: hydrate from the source of truth once on mount.
  useEffect(() => {
    let active = true;
    void source
      .read()
      .then((hydrated) => {
        if (active) setState(hydrated);
      })
      .catch((err: unknown) => {
        console.warn("Launch State hydration failed; using signed-out fallback.", err);
        if (active) setState(HYDRATION_FAILURE_FALLBACK);
      });
    return () => {
      active = false;
    };
  }, [source]);

  const store = useMemo<LaunchStateStore>(
    () => ({
      state,
      markSignedIn: () => setState(withSignedIn),
      markSignedOut: () => setState((s) => ({ ...s, signedIn: false })),
      setConsent: (status) => setState((s) => ({ ...s, consent: status })),
      setSiblingInvitation: (status) => setState((s) => ({ ...s, siblingInvitation: status })),
    }),
    [state],
  );

  return <LaunchStateContext.Provider value={store}>{children}</LaunchStateContext.Provider>;
}

export function useLaunchState(): LaunchStateStore {
  const store = useContext(LaunchStateContext);
  if (!store) {
    throw new Error("useLaunchState must be used within a LaunchStateProvider");
  }
  return store;
}
