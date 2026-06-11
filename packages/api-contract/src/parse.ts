/**
 * Parse-at-boundary helper for Control Plane HTTP endpoints.
 *
 * Decode raw request/response bodies through their api-contract schema at the
 * runtime boundary (the HTTP handler); never pass unvalidated data into
 * service/repo layers. See docs/CONVENTIONS.md → "Parse at the boundary".
 *
 * The decode itself lives in `@intentive/boundary` — the single leak-free
 * `parseBoundary`/`BoundaryParseError` shared with the WebSocket boundary
 * (see docs/adr/0004). Re-exported here so HTTP call sites keep importing from
 * `@intentive/api-contract`.
 */

export { BoundaryParseError, parseBoundary } from "@intentive/boundary";
