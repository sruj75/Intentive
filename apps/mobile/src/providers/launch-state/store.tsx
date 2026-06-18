/**
 * Launch State store — the single in-memory holder of the client's Launch State,
 * shared across domains via React context. It lives under `src/providers/`
 * (not a domain) because both `auth` (Identity Gate) and `onboarding`
 * (Consent / Sibling) write to it; a store inside one domain would be a
 * cross-domain import.
 *
 * Roles, kept separate (see apps/mobile/docs/adr/0011-*):
 *   - read path:  `LaunchStateSource` hydrates the store on mount and reconciles
 *                 it after a successful sign-in.
 *   - write path: gate completion calls a mutator, which updates the store
 *                 OPTIMISTICALLY (instant Launch Route transition). The durable POST to the
 *                 Control Plane is a later concern (#23/#26).
 *
 * Nothing is persisted to disk. Cold launch starts UNKNOWN (→ RESOLVING).
 * The resolver reads only this store; it never reads the source directly.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
 * Build the local fallback for sign-in when the source cannot prove a signed-in
 * server state. A signed-in state with a `null` gate strands the resolver on
 * `RESOLVING`, so the fallback pre-seeds unknown gates to `pending`.
 */
function withSignedIn(state: LaunchState): LaunchState {
  return {
    signedIn: true,
    consent: state.consent ?? "pending",
    siblingInvitation: state.siblingInvitation ?? "pending",
  };
}

function withSignedInFallback(current: LaunchState, fallback: LaunchState): LaunchState {
  return {
    signedIn: true,
    consent: current.consent ?? fallback.consent,
    siblingInvitation: current.siblingInvitation ?? fallback.siblingInvitation,
  };
}

export interface LaunchStateStore {
  state: LaunchState;
  /** Identity Gate completed; reconcile with Launch State Source before trusting local gates. */
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
  const readGenerationRef = useRef(0);

  // Read path: hydrate from the source of truth once on mount.
  useEffect(() => {
    let active = true;
    const generation = readGenerationRef.current + 1;
    readGenerationRef.current = generation;
    void source
      .read()
      .then((hydrated) => {
        if (active && readGenerationRef.current === generation) setState(hydrated);
      })
      .catch((err: unknown) => {
        console.warn("Launch State hydration failed; using signed-out fallback.", err);
        if (active && readGenerationRef.current === generation) {
          setState(HYDRATION_FAILURE_FALLBACK);
        }
      });
    return () => {
      active = false;
    };
  }, [source]);

  const store = useMemo<LaunchStateStore>(
    () => ({
      state,
      markSignedIn: () => {
        const fallback = withSignedIn(state);
        const generation = readGenerationRef.current + 1;
        readGenerationRef.current = generation;
        setState({ signedIn: true, consent: null, siblingInvitation: null });

        void source
          .read()
          .then((hydrated) => {
            if (readGenerationRef.current !== generation) return;
            if (hydrated.signedIn === true) {
              setState(hydrated);
              return;
            }
            setState((current) => withSignedInFallback(current, fallback));
          })
          .catch(() => {
            if (readGenerationRef.current === generation) {
              setState((current) => withSignedInFallback(current, fallback));
            }
          });
      },
      markSignedOut: () => {
        readGenerationRef.current += 1;
        setState((s) => ({ ...s, signedIn: false }));
      },
      setConsent: (status) => setState((s) => ({ ...s, consent: status })),
      setSiblingInvitation: (status) => setState((s) => ({ ...s, siblingInvitation: status })),
    }),
    [source, state],
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
