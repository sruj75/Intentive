import type { AccountState } from "@intentive/api-contract";

export interface AccountStateSource {
  /** Returns current Control Plane account state, or null when no session exists. */
  read(): Promise<AccountState | null>;
}
