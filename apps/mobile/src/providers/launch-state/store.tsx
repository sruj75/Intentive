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
 *   - write path: shared gate completion is persisted by the source, then the
 *                 store reconciles before navigation can advance.
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

const UNKNOWN: LaunchState = {
  signedIn: null,
  consent: null,
  onboarding: null,
  siblingInvitation: null,
  trial: null,
};

// Hydration-failure signed-out fallback. `null` gates are safe here: the user
// can only leave this state by signing in, and `markSignedIn` heals any unknown
// gate to `pending` so the resolver always has concrete values to walk forward
// (see markSignedIn). The signed-out short-circuit hides the gates until then.
const HYDRATION_FAILURE_FALLBACK: LaunchState = {
  signedIn: false,
  consent: null,
  onboarding: null,
  siblingInvitation: null,
  trial: null,
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
    onboarding: state.onboarding ?? "pending",
    siblingInvitation: state.siblingInvitation ?? "pending",
    trial: state.trial ?? "pending",
  };
}

function withSignedInFallback(current: LaunchState, fallback: LaunchState): LaunchState {
  return {
    signedIn: true,
    consent: current.consent ?? fallback.consent,
    onboarding: current.onboarding ?? fallback.onboarding,
    siblingInvitation: current.siblingInvitation ?? fallback.siblingInvitation,
    trial: current.trial ?? fallback.trial,
  };
}

export interface LaunchStateStore {
  state: LaunchState;
  /** Identity Gate completed; reconcile with Launch State Source before trusting local gates. */
  markSignedIn: () => void;
  /** Account Surface logout completed; keep known gate progress for same-session re-login. */
  markSignedOut: () => void;
  /** Consent Primer answered locally (dev/test only). */
  setConsent: (status: GateStatus) => void;
  /** Onboarding funnel (name → source → permissions) completed (optimistic). */
  setOnboarding: (status: GateStatus) => void;
  /**
   * Persist the terminal Sibling Client Invitation skip, then reconcile with
   * Control Plane truth. READY is never asserted locally.
   */
  completeOnboardingFunnel: () => Promise<void>;
  /** Persist explicit Consent Primer acceptance, then reconcile server truth. */
  acceptConsent: () => Promise<void>;
  /** Sibling Client Invitation answered — `completed` or `skipped` (optimistic). */
  setSiblingInvitation: (status: GateStatus) => void;
  /** Free Trial gate answered (optimistic). */
  setTrial: (status: GateStatus) => void;
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

  const reconcile = async (): Promise<LaunchState> => {
    const generation = readGenerationRef.current + 1;
    readGenerationRef.current = generation;
    const hydrated = await source.read();
    if (readGenerationRef.current === generation) setState(hydrated);
    return hydrated;
  };

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
        setState({
          signedIn: true,
          consent: null,
          onboarding: null,
          siblingInvitation: null,
          trial: null,
        });

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
      setOnboarding: (status) => setState((s) => ({ ...s, onboarding: status })),
      acceptConsent: async () => {
        if (!source.acceptConsent) {
          setState((s) => ({ ...s, consent: "completed" }));
          return;
        }
        await source.acceptConsent();
        const hydrated = await reconcile();
        if (hydrated.signedIn !== true || hydrated.consent !== "completed") {
          throw new Error("Control Plane did not confirm consent completion");
        }
      },
      completeOnboardingFunnel: async () => {
        if (!source.skipSiblingInvitation) {
          setState((s) => ({
            ...s,
            onboarding: "completed",
            siblingInvitation: "skipped",
            trial: "completed",
          }));
          return;
        }
        await source.skipSiblingInvitation();
        const hydrated = await reconcile();
        if (
          hydrated.signedIn !== true ||
          hydrated.consent !== "completed" ||
          hydrated.onboarding !== "completed" ||
          hydrated.siblingInvitation === "pending" ||
          hydrated.siblingInvitation === null ||
          hydrated.trial !== "completed"
        ) {
          throw new Error("Control Plane did not confirm onboarding completion");
        }
      },
      setSiblingInvitation: (status) => setState((s) => ({ ...s, siblingInvitation: status })),
      setTrial: (status) => setState((s) => ({ ...s, trial: status })),
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
