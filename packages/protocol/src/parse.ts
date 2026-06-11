/**
 * Parse-at-boundary helpers for the Protocol.
 *
 * Decode raw inbound payloads through the canonical discriminated unions at the
 * runtime boundary (the WebSocket message handler); never pass unvalidated data
 * into service/repo layers. See docs/CONVENTIONS.md → "Parse at the boundary".
 *
 * `parse*` throws a leak-free `BoundaryParseError` (the same type the HTTP
 * boundary throws — see `@intentive/boundary` and docs/adr/0004) listing only
 * the offending key paths. `safeParse*` returns a Zod result object for callers
 * that branch without try/catch (the WS handler uses it for control flow).
 */

import { parseBoundary } from "@intentive/boundary";

import {
  clientToRuntimeEvent,
  runtimeToClientEvent,
  type ClientToRuntimeEvent,
  type RuntimeToClientEvent,
} from "./index.js";

export { BoundaryParseError } from "@intentive/boundary";

export function parseClientToRuntimeEvent(raw: unknown): ClientToRuntimeEvent {
  return parseBoundary(clientToRuntimeEvent, raw);
}

export function safeParseClientToRuntimeEvent(raw: unknown) {
  return clientToRuntimeEvent.safeParse(raw);
}

export function parseRuntimeToClientEvent(raw: unknown): RuntimeToClientEvent {
  return parseBoundary(runtimeToClientEvent, raw);
}

export function safeParseRuntimeToClientEvent(raw: unknown) {
  return runtimeToClientEvent.safeParse(raw);
}
