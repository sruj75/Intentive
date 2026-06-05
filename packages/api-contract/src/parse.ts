/**
 * Parse-at-boundary helper for Control Plane HTTP endpoints.
 *
 * Decode raw request/response bodies through their api-contract schema at the
 * runtime boundary (the HTTP handler); never pass unvalidated data into
 * service/repo layers. See docs/CONVENTIONS.md → "Parse at the boundary".
 *
 * On failure this throws a `BoundaryParseError` that surfaces only the offending
 * key paths — never the values — mirroring the fail-fast config pattern in
 * services/control-plane/src/config/env.ts.
 */

import type { ZodType } from "zod";

export class BoundaryParseError extends Error {
  readonly keys: string[];

  constructor(keys: string[]) {
    super(`Invalid payload: ${keys.length > 0 ? keys.join(", ") : "(root)"}`);
    this.name = "BoundaryParseError";
    this.keys = keys;
  }
}

export function parseBoundary<T>(schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const keys = new Set<string>();
    for (const issue of result.error.issues) {
      if (issue.code === "unrecognized_keys") {
        // Strict schemas report rejected unknown keys here, not on the path.
        for (const key of issue.keys) keys.add(key);
      } else {
        keys.add(issue.path.map(String).join(".") || "(root)");
      }
    }
    throw new BoundaryParseError([...keys].sort());
  }
  return result.data;
}
