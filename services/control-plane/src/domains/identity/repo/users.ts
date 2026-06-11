/**
 * Users repo — the only place that knows the `control_plane.users` SQL.
 *
 * A deep module behind a one-method interface: callers ask "give me the
 * user_id for this verified subject" and get back an opaque id, with the table
 * shape, the upsert, idempotency, and id generation all hidden in here. Swapping
 * the storage (or the SQL) never touches the service or the HTTP layer.
 *
 * The `sub` is the Neon Auth subject from a *verified* JWT — resolving an
 * unverified sub would mint a user for an unauthenticated caller, so the verify
 * step (identity service) always runs first.
 */
import type { Sql } from "../../../db/sql.js";

export interface UsersRepo {
  /**
   * Return the stable `user_id` for `sub`, creating the row on first sight.
   * Idempotent: the same `sub` always resolves to the same id (enforced by the
   * UNIQUE(sub) constraint, not by application logic).
   */
  resolveUser(input: { sub: string }): Promise<{ userId: string }>;
}

export function createUsersRepo(sql: Sql): UsersRepo {
  return {
    async resolveUser({ sub }) {
      // ON CONFLICT … DO UPDATE (a no-op touch of `sub`) so the RETURNING clause
      // yields the id on both the insert and the conflict path in one round trip.
      const rows = await sql<{ id: string }>`
        INSERT INTO control_plane.users (sub)
        VALUES (${sub})
        ON CONFLICT (sub) DO UPDATE SET sub = EXCLUDED.sub
        RETURNING id
      `;
      const row = rows[0];
      if (!row) {
        // The upsert always returns exactly one row; a missing row means the
        // query contract was broken (e.g. wrong SQL), not a normal outcome.
        throw new Error("resolveUser: upsert returned no row");
      }
      return { userId: row.id };
    },
  };
}
