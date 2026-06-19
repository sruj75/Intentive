/**
 * In-memory Account State projection — a transient, read-through view of Control
 * Plane account state for the account/chat utility surfaces (Mac setup banner,
 * Account Surface identity). Parallel in spirit to Launch State but scoped here:
 * nothing is persisted to disk, and a missing source projects `null`.
 *
 * Both the Companion Chat Mac setup banner and the Account Surface render the
 * same projected `accountState`, so the read lives above them (in the route-entry
 * composition) instead of being duplicated inside each surface. `refreshAccountState`
 * re-reads on demand; `clearBeforeRead` drops stale identity before the next read
 * resolves so a reopened surface never shows a previous account.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountState } from "@intentive/api-contract";

import type { AccountStateSource } from "./source";

export interface RefreshAccountStateOptions {
  /** Clear the projection to `null` before the next read resolves. */
  readonly clearBeforeRead?: boolean;
}

export interface AccountStateProjection {
  readonly accountState: AccountState | null;
  readonly refreshAccountState: (options?: RefreshAccountStateOptions) => void;
}

export function useAccountStateProjection(source?: AccountStateSource): AccountStateProjection {
  const [accountState, setAccountState] = useState<AccountState | null>(null);
  const readGenerationRef = useRef(0);

  const refreshAccountState = useCallback(
    (options?: RefreshAccountStateOptions) => {
      const generation = readGenerationRef.current + 1;
      readGenerationRef.current = generation;

      if (!source) {
        setAccountState(null);
        return;
      }
      if (options?.clearBeforeRead === true) setAccountState(null);

      void source
        .read()
        .then((next) => {
          if (readGenerationRef.current === generation) setAccountState(next);
        })
        .catch(() => {
          if (readGenerationRef.current === generation) setAccountState(null);
        });
    },
    [source],
  );

  // Hydrate on mount and whenever a new source is wired.
  useEffect(() => {
    refreshAccountState();
  }, [refreshAccountState]);

  return { accountState, refreshAccountState };
}
