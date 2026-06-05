/**
 * Parse-at-boundary helpers for the Protocol.
 *
 * Decode raw inbound payloads through the canonical discriminated unions at the
 * runtime boundary (the WebSocket message handler); never pass unvalidated data
 * into service/repo layers. See docs/CONVENTIONS.md → "Parse at the boundary".
 *
 * `parse*` throws a ZodError on invalid input; `safeParse*` returns a Zod
 * result object for callers that want to branch without try/catch.
 */

import {
  clientToRuntimeEvent,
  runtimeToClientEvent,
  type ClientToRuntimeEvent,
  type RuntimeToClientEvent,
} from "./index.js";

export function parseClientToRuntimeEvent(raw: unknown): ClientToRuntimeEvent {
  return clientToRuntimeEvent.parse(raw);
}

export function safeParseClientToRuntimeEvent(raw: unknown) {
  return clientToRuntimeEvent.safeParse(raw);
}

export function parseRuntimeToClientEvent(raw: unknown): RuntimeToClientEvent {
  return runtimeToClientEvent.parse(raw);
}

export function safeParseRuntimeToClientEvent(raw: unknown) {
  return runtimeToClientEvent.safeParse(raw);
}
