/**
 * @intentive/boundary — the one parse-at-boundary decode for every inbound
 * boundary in the system (the WebSocket message handler in the Agent Runtime
 * and the HTTP handlers in the Control Plane).
 *
 * Decode raw inbound payloads through their Zod schema at the runtime boundary;
 * never pass unvalidated data into service/repo layers. See
 * docs/CONVENTIONS.md → "Parse at the boundary" and docs/adr/0004.
 *
 * On failure this throws a `BoundaryParseError` that surfaces only the offending
 * key paths — never the values — mirroring the fail-fast config pattern in
 * services/control-plane/src/config/env.ts. One error type, system-wide.
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
