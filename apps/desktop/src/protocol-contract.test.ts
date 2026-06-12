/**
 * Cross-language round-trip guard for the Rust-emitted Protocol frames.
 *
 * The Desktop Client is a Protocol *client*: its Rust composition root frames
 * Context Snapshots and Session End Markers and pushes them over the live
 * WebSocket. That Rust serializer is invisible to the TS-only `contract-drift`
 * sensor, and the Protocol carries no Runtime→Client ack — so a frame drifting
 * from the live Zod contract would be silent total data loss (ADR-0005:
 * fire-and-forget, at-most-once).
 *
 * These tests close that blind spot by verifying committed golden fixtures from
 * the consumer side: the same `src-tauri/fixtures/*.json` the Rust golden tests
 * reproduce byte-for-value must be *accepted* by the real `@intentive/protocol`
 * Zod boundary parser. Rust ⟷ fixture ⟷ live contract.
 *
 * The fixtures are committed (not generated) because Vitest runs before cargo
 * in the desktop test script — there is no Rust output to read at test time.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BoundaryParseError, parseClientToRuntimeEvent } from "@intentive/protocol";
import { describe, expect, it } from "vitest";

// Vitest runs with the Desktop package root as cwd; the committed Rust golden
// fixtures live alongside the serializer under `src-tauri/fixtures/`.
function readFixture(name: string): unknown {
  const path = resolve(process.cwd(), "src-tauri/fixtures", name);
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("Rust Protocol frames satisfy the live Zod contract", () => {
  it("accepts the context_snapshot golden fixture", () => {
    const result = parseClientToRuntimeEvent(readFixture("context_snapshot.json"));
    expect(result.type).toBe("context_snapshot");
  });

  it("accepts the session_end_marker golden fixture", () => {
    const result = parseClientToRuntimeEvent(readFixture("session_end_marker.json"));
    expect(result.type).toBe("session_end_marker");
  });

  // The one enum that crosses the language wall. The Rust `SessionEndReason`
  // serializes snake_case (`user_toggle`/`quit`/`crash`); the contract must
  // accept each variant and reject anything else, or a renamed Rust variant
  // would push frames the Runtime silently drops.
  it("accepts every SessionEndReason variant the Rust enum can emit", () => {
    for (const reason of ["user_toggle", "quit", "crash"] as const) {
      const result = parseClientToRuntimeEvent({
        type: "session_end_marker",
        ended_at: "2023-11-14T22:13:20Z",
        reason,
      });
      expect(result.type).toBe("session_end_marker");
    }
  });

  it("rejects a session_end_marker reason outside the contract enum", () => {
    expect(() =>
      parseClientToRuntimeEvent({
        type: "session_end_marker",
        ended_at: "2023-11-14T22:13:20Z",
        reason: "unknown_reason",
      }),
    ).toThrow(BoundaryParseError);
  });
});
