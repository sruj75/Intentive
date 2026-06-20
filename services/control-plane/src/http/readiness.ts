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
  /** Per-check budget. A dependency that hangs past this is reported `failed`. */
  timeoutMs?: number;
}): Readiness {
  const timeoutMs = deps.timeoutMs ?? 3_000;

  return {
    async check() {
      // Bound each check so a dependency that accepts the connection but never
      // responds (a hung host, not a refused one) surfaces as `failed` promptly
      // rather than letting `/ready` block on the underlying fetch/socket
      // timeout — detecting that is the whole point of the probe.
      const [neon, jwks] = await Promise.allSettled([
        withTimeout(deps.sql`SELECT 1`, timeoutMs),
        withTimeout(deps.verifier.probe(), timeoutMs),
      ]);

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

/**
 * Settle `work` as `failed` if it does not finish within `timeoutMs`. The timer
 * is always cleared so a fast check never leaves a dangling handle. The orphaned
 * `work` promise is left to settle on its own — the probe's `fetch` carries no
 * abort signal — but it no longer holds up the readiness response.
 */
function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`readiness check timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
