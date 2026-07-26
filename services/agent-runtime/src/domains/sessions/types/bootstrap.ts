export type BootstrapStatus = "pending" | "in_progress" | "completed";
export type BootstrapSqlQuery = Promise<unknown[]>;

/**
 * Durable one-time personalization state for one Agent Instance.
 *
 * Opening Orientation moves a pending bootstrap into progress in the same
 * transaction as its visible opening. The first successful Interactive Turn
 * completes it in the same transaction as the Companion reply.
 */
export interface BootstrapLifecycleRepo {
  readStatus(userId: string): Promise<BootstrapStatus>;
  markInProgressQuery(userId: string): BootstrapSqlQuery;
  markCompletedQuery(userId: string): BootstrapSqlQuery;
}

export interface BootstrapTurn {
  readonly firstRun: boolean;
  transitionOnSuccessQuery(): BootstrapSqlQuery | null;
}

/**
 * Owns the policy for moving one Agent Instance through its one-time
 * personalization lifecycle. Callers only decide which kind of turn they are
 * preparing and include the returned transition in that turn's transaction.
 */
export interface BootstrapLifecycle {
  prepareOpening(userId: string): Promise<BootstrapTurn>;
  prepareInteractive(userId: string, eligible: boolean): Promise<BootstrapTurn>;
}
