import type { JwtVerifier } from "@intentive/providers/auth";

import type { Sql } from "../db/sql.js";

export type ReadinessCheckStatus = "ok" | "failed";

export interface ReadinessResult {
  readonly ready: boolean;
  readonly checks: {
    readonly neon: ReadinessCheckStatus;
    readonly jwks: ReadinessCheckStatus;
  };
}

export interface Readiness {
  check(): Promise<ReadinessResult>;
}

export function createReadiness(deps: {
  sql: Sql;
  verifier: Pick<JwtVerifier, "probe">;
}): Readiness {
  return {
    async check() {
      const [neon, jwks] = await Promise.allSettled([deps.sql`SELECT 1`, deps.verifier.probe()]);

      const checks = {
        neon: neon.status === "fulfilled" ? "ok" : "failed",
        jwks: jwks.status === "fulfilled" ? "ok" : "failed",
      } as const;

      return {
        ready: checks.neon === "ok" && checks.jwks === "ok",
        checks,
      };
    },
  };
}
