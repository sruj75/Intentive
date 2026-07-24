"use strict";

// Pure-Node self-test for the Rust architecture checker.
// Runs without any external deps: `node tools/linters/rust-architecture/test.js`.

const assert = require("node:assert/strict");
const { parseRustDomainPath } = require("./lib/rust-path-parser");
const { extractDomainReferences } = require("./lib/rust-imports");
const { checkSource } = require("./lib/check-source");
const { structuralMessage, structuralViolations } = require("./lib/check-structure");

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const BASE = "/x/Hey Intentive/apps/desktop/src-tauri/src";

function assertAgentInstructive(message, preferredLabel = "Preferred path:") {
  assert.match(message, /Rule violated:/);
  assert.match(message, /Owning boundary:/);
  assert.match(message, new RegExp(preferredLabel));
  assert.match(message, /Example fix:/);
}

// ── parseRustDomainPath ─────────────────────────────────────────────────────

test("parses a flat-file layer (service.rs)", () => {
  assert.deepEqual(parseRustDomainPath(`${BASE}/domains/capture/service.rs`), {
    deployable: "desktop",
    domain: "capture",
    layer: "service",
  });
});

test("parses a directory layer (runtime/mod.rs)", () => {
  assert.deepEqual(parseRustDomainPath(`${BASE}/domains/snapshots/runtime/mod.rs`), {
    deployable: "desktop",
    domain: "snapshots",
    layer: "runtime",
  });
});

test("parses a nested file inside a layer dir", () => {
  assert.deepEqual(
    parseRustDomainPath(`${BASE}/domains/capture/runtime/screenpipe/supervisor.rs`),
    {
      deployable: "desktop",
      domain: "capture",
      layer: "runtime",
    },
  );
});

test("returns null for composition root and non-domain paths", () => {
  assert.strictEqual(parseRustDomainPath(`${BASE}/lib.rs`), null);
  assert.strictEqual(parseRustDomainPath(`${BASE}/main.rs`), null);
  assert.strictEqual(parseRustDomainPath(`${BASE}/build.rs`), null);
  assert.strictEqual(parseRustDomainPath(""), null);
  assert.strictEqual(parseRustDomainPath(undefined), null);
});

// ── extractDomainReferences ─────────────────────────────────────────────────

test("extracts crate::domains references with line numbers, de-duped", () => {
  const src = [
    "use crate::domains::snapshots::types::ContextSnapshot;", // line 1
    "",
    "fn f() {",
    "    let _ = crate::domains::capture::service::probe();", // line 4
    "    let _ = crate::domains::capture::service::probe();", // dup
    "}",
  ].join("\n");
  assert.deepEqual(extractDomainReferences(src), [
    { domain: "snapshots", layer: "types", line: 1 },
    { domain: "capture", layer: "service", line: 4 },
  ]);
});

test("ignores self:: and super:: relative paths", () => {
  const src = "use super::types::Foo;\nuse self::helper::bar;\nuse crate::config::AppConfig;";
  assert.deepEqual(extractDomainReferences(src), []);
});

// ── checkSource: layer direction ────────────────────────────────────────────

test("forward import (runtime -> service) is allowed", () => {
  const v = checkSource({
    filePath: `${BASE}/domains/capture/runtime/mod.rs`,
    source: "use crate::domains::capture::service::Fsm;",
  });
  assert.deepEqual(v, []);
});

test("same-layer reference is allowed", () => {
  const v = checkSource({
    filePath: `${BASE}/domains/capture/service/a.rs`,
    source: "use crate::domains::capture::service::b::Helper;",
  });
  assert.deepEqual(v, []);
});

test("backward import (service -> runtime) is flagged", () => {
  const v = checkSource({
    filePath: `${BASE}/domains/capture/service/fsm.rs`,
    source: "use crate::domains::capture::runtime::Coordinator;",
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].messageId, "backwardImport");
  assert.match(v[0].message, /types → config → repo → service → runtime → ui/);
  assertAgentInstructive(v[0].message);
});

test("providers is cross-cutting and importable from any layer", () => {
  const v = checkSource({
    filePath: `${BASE}/domains/capture/types/a.rs`,
    source: "use crate::domains::capture::providers::telemetry::emit;",
  });
  assert.deepEqual(v, []);
});

test("a providers-layer file is itself exempt", () => {
  const v = checkSource({
    filePath: `${BASE}/domains/capture/providers/mod.rs`,
    source: "use crate::domains::capture::runtime::Coordinator;",
  });
  assert.deepEqual(v, []);
});

// ── checkSource: cross-domain ───────────────────────────────────────────────

test("cross-domain reference to a non-types layer is flagged", () => {
  const v = checkSource({
    filePath: `${BASE}/domains/snapshots/runtime/emit.rs`,
    source: "use crate::domains::capture::runtime::Coordinator;",
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].messageId, "crossDomainImport");
  assert.match(v[0].message, /lib\.rs/);
  assertAgentInstructive(v[0].message);
});

test("cross-domain reference to another domain's types layer is allowed", () => {
  const v = checkSource({
    filePath: `${BASE}/domains/snapshots/runtime/emit.rs`,
    source: "use crate::domains::capture::types::SessionEndReason;",
  });
  assert.deepEqual(v, []);
});

test("test modules may compose across domains", () => {
  const v = checkSource({
    filePath: `${BASE}/domains/snapshots/runtime/heartbeat/tests.rs`,
    source: "use crate::domains::capture::runtime::screenpipe_supervisor::ScreenpipeEndpoint;",
  });
  assert.deepEqual(v, []);
});

test("crate::providers cross-cutting references are never flagged", () => {
  const v = checkSource({
    filePath: `${BASE}/domains/summarization/service/bundled.rs`,
    source: "use crate::providers::port::resolve_port;",
  });
  assert.deepEqual(v, []);
});

test("composition root (lib.rs) is exempt even with cross-domain wiring", () => {
  const v = checkSource({
    filePath: `${BASE}/lib.rs`,
    source:
      "use crate::domains::capture::runtime::Coordinator;\nuse crate::domains::snapshots::repo::Store;",
  });
  assert.deepEqual(v, []);
});

test("non-domain crate paths are ignored", () => {
  const v = checkSource({
    filePath: `${BASE}/domains/capture/service/a.rs`,
    source: "use crate::utils::log;\nuse std::sync::Arc;",
  });
  assert.deepEqual(v, []);
});

// ── structuralViolations ────────────────────────────────────────────────────

test("clean src/ layout passes the structural check", () => {
  assert.deepEqual(structuralViolations(["lib.rs", "main.rs", "domains", "providers"]), []);
});

test("stray top-level modules under src/ are flagged", () => {
  assert.deepEqual(structuralViolations(["lib.rs", "domains", "capture_session", "snapshot.rs"]), [
    "capture_session",
    "snapshot.rs",
  ]);
});

test("structural violation message tells agents how to repair it", () => {
  const message = structuralMessage("snapshot.rs");
  assertAgentInstructive(message);
  assert.match(message, /domains\/<domain>\/<layer>\//);
  assert.match(message, /domains\/capture\/service\/snapshot\.rs/);
});

// ── runner ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
  }
}
console.log(`\nrust-architecture: ${passed} passed, ${failed} failed (${tests.length} total)`);
if (failed > 0) process.exit(1);
