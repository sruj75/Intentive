"use strict";

// Pure-Node self-test for the path parser and layer-rule logic.
// Runs without ESLint installed: `node tools/linters/.../test.js`.

const assert = require("node:assert/strict");
const path = require("node:path");
const { parseDomainPath } = require("./lib/path-parser");
const { canImport } = require("./lib/layer-rules");

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ── parseDomainPath ─────────────────────────────────────────────────────────

test("parses a Mobile Client domain path", () => {
  assert.deepEqual(
    parseDomainPath("/x/Hey Intentive/apps/mobile/src/domains/chat/service/sendMessage.ts"),
    { kind: "apps", deployable: "mobile", domain: "chat", layer: "service" },
  );
});

test("parses an Agent Runtime domain path", () => {
  assert.deepEqual(
    parseDomainPath("/x/services/agent-runtime/src/domains/gateway/runtime/handler.ts"),
    { kind: "services", deployable: "agent-runtime", domain: "gateway", layer: "runtime" },
  );
});

test("parses a Desktop Tauri (Rust) domain path", () => {
  assert.deepEqual(
    parseDomainPath("/x/apps/desktop/src-tauri/src/domains/capture/repo/sqlite.rs"),
    { kind: "apps", deployable: "desktop", domain: "capture", layer: "repo" },
  );
});

test("returns null for non-domain paths", () => {
  assert.strictEqual(parseDomainPath("/x/apps/mobile/src/utils/helper.ts"), null);
  assert.strictEqual(parseDomainPath("/x/packages/protocol/src/index.ts"), null);
  assert.strictEqual(parseDomainPath(""), null);
  assert.strictEqual(parseDomainPath(undefined), null);
});

// ── canImport ───────────────────────────────────────────────────────────────

test("service may import repo (forward, lower layer)", () => {
  assert.strictEqual(canImport("service", "repo"), true);
});

test("service may not import runtime (backward)", () => {
  assert.strictEqual(canImport("service", "runtime"), false);
});

test("service may not import ui (backward, two steps)", () => {
  assert.strictEqual(canImport("service", "ui"), false);
});

test("same-layer imports are allowed", () => {
  assert.strictEqual(canImport("service", "service"), true);
});

test("any layer may import providers (cross-cutting)", () => {
  assert.strictEqual(canImport("types", "providers"), true);
  assert.strictEqual(canImport("ui", "providers"), true);
});

test("types may not import anything else in the layer order", () => {
  assert.strictEqual(canImport("types", "config"), false);
  assert.strictEqual(canImport("types", "repo"), false);
});

test("ui may import everything below it", () => {
  for (const lower of ["types", "config", "repo", "service", "runtime"]) {
    assert.strictEqual(canImport("ui", lower), true, `ui → ${lower}`);
  }
});

test("unknown layers do not trip the rule (benefit of the doubt)", () => {
  assert.strictEqual(canImport("service", "unknown"), true);
  assert.strictEqual(canImport("unknown", "service"), true);
});

// ── ESLint integration tests via RuleTester ─────────────────────────────────
// Verify the rules actually fire end-to-end when ESLint runs them against
// real TypeScript source with domain-shaped filenames.

const { RuleTester } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const plugin = require("./index.js");

// RuleTester normally uses Mocha-style globals. Adapt it to the simple
// pass/fail runner this file already uses.
RuleTester.describe = (name, fn) => fn();
RuleTester.it = (name, fn) => tests.push([`integration: ${name}`, fn]);
RuleTester.itOnly = RuleTester.it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: "latest",
    sourceType: "module",
  },
});

const MOBILE_CHAT_SERVICE = "/repo/apps/mobile/src/domains/chat/service/sendMessage.ts";
const MOBILE_CHAT_TYPES = "/repo/apps/mobile/src/domains/chat/types/index.ts";
const REPO_ROOT = path.resolve(__dirname, "../../..");
const CONTROL_PLANE_CONFIG = `${REPO_ROOT}/services/control-plane/src/config/env.ts`;
const CONTROL_PLANE_IDENTITY_SERVICE = `${REPO_ROOT}/services/control-plane/src/domains/identity/service/resolve-account.ts`;
const PROTOCOL_PACKAGE_SOURCE = `${REPO_ROOT}/packages/protocol/src/index.ts`;
const PROVIDERS_SENTRY_SOURCE = `${REPO_ROOT}/packages/providers/src/observability/sentry.ts`;
const PROVIDERS_LANGFUSE_SOURCE = `${REPO_ROOT}/packages/providers/src/observability/langfuse.ts`;
const AGENT_RUNTIME_MAIN = `${REPO_ROOT}/services/agent-runtime/src/main.ts`;
const AGENT_RUNTIME_TURN_SERVICE = `${REPO_ROOT}/services/agent-runtime/src/domains/runtime/service/turn.ts`;
const MOBILE_AUTH_SOURCE = `${REPO_ROOT}/apps/mobile/src/domains/auth/service/neon-client.ts`;
const DESKTOP_ONBOARDING_SOURCE = `${REPO_ROOT}/apps/desktop/src/domains/onboarding/ui/Onboarding.tsx`;
const AGENT_INSTRUCTIVE_MESSAGE =
  /Rule violated:[\s\S]*Owning boundary:[\s\S]*Preferred import path:[\s\S]*Example fix:/;

ruleTester.run("layer-direction", plugin.rules["layer-direction"], {
  valid: [
    {
      name: "service may import repo (forward, same domain)",
      filename: MOBILE_CHAT_SERVICE,
      code: "import { db } from '../repo/db';",
    },
    {
      name: "workspace-name import (packages/) is never flagged",
      filename: MOBILE_CHAT_SERVICE,
      code: "import { userMessage } from '@intentive/protocol';",
    },
    {
      name: "types may import providers (cross-cutting allowed)",
      filename: MOBILE_CHAT_TYPES,
      code: "import { auth } from '../providers/auth';",
    },
    {
      name: "service may import another domain's public types/ contract",
      filename: MOBILE_CHAT_SERVICE,
      code: "import type { Token } from '../../auth/types/token';",
    },
  ],
  invalid: [
    {
      name: "service importing runtime is a backwardImport",
      filename: MOBILE_CHAT_SERVICE,
      code: "import { handler } from '../runtime/handler';",
      errors: [
        {
          message: AGENT_INSTRUCTIVE_MESSAGE,
        },
      ],
    },
    {
      name: "service reaching into another domain is a crossDomainImport",
      filename: MOBILE_CHAT_SERVICE,
      code: "import { token } from '../../auth/repo/token';",
      errors: [
        {
          message: AGENT_INSTRUCTIVE_MESSAGE,
        },
      ],
    },
  ],
});

ruleTester.run("no-cross-deployable", plugin.rules["no-cross-deployable"], {
  valid: [
    {
      name: "workspace-name import does not trip the rule",
      filename: MOBILE_CHAT_SERVICE,
      code: "import { x } from '@intentive/protocol';",
    },
    {
      name: "same-deployable relative import is fine",
      filename: MOBILE_CHAT_SERVICE,
      code: "import { db } from '../repo/db';",
    },
  ],
  invalid: [
    {
      name: "mobile reaching into desktop by relative path is a crossDeployable",
      filename: MOBILE_CHAT_SERVICE,
      code: "import { foo } from '../../../../../desktop/src/domains/capture/service/foo';",
      errors: [
        {
          message: AGENT_INSTRUCTIVE_MESSAGE,
        },
      ],
    },
  ],
});

ruleTester.run("provider-only-cross-cutting", plugin.rules["provider-only-cross-cutting"], {
  valid: [
    {
      name: "providers observability may import Sentry directly",
      filename: PROVIDERS_SENTRY_SOURCE,
      code: "import * as Sentry from '@sentry/node';",
    },
    {
      name: "providers observability may import Langfuse tracing handlers directly",
      filename: PROVIDERS_LANGFUSE_SOURCE,
      code: "import { CallbackHandler } from 'langfuse-langchain';",
    },
    {
      name: "deployable code may import the providers observability seam",
      filename: CONTROL_PLANE_IDENTITY_SERVICE,
      code: "import { bootstrapObservability } from '@intentive/providers/observability';",
    },
    {
      name: "Agent Runtime main may keep the prompt-floor Langfuse client exception",
      filename: AGENT_RUNTIME_MAIN,
      code: "import { Langfuse } from 'langfuse-langchain';",
    },
  ],
  invalid: [
    {
      name: "Control Plane domain may not import Sentry directly",
      filename: CONTROL_PLANE_IDENTITY_SERVICE,
      code: "import * as Sentry from '@sentry/node';",
      errors: [{ message: AGENT_INSTRUCTIVE_MESSAGE }],
    },
    {
      name: "Agent Runtime domain may not instantiate Langfuse tracing directly",
      filename: AGENT_RUNTIME_TURN_SERVICE,
      code: "import { CallbackHandler } from 'langfuse-langchain';",
      errors: [{ message: AGENT_INSTRUCTIVE_MESSAGE }],
    },
    {
      name: "Agent Runtime main exception does not allow tracing handlers",
      filename: AGENT_RUNTIME_MAIN,
      code: "import { CallbackHandler, Langfuse } from 'langfuse-langchain';",
      errors: [{ message: AGENT_INSTRUCTIVE_MESSAGE }],
    },
  ],
});

test("plugin exports and recommends provider-only-cross-cutting", () => {
  assert.ok(plugin.rules["provider-only-cross-cutting"]);
  assert.equal(
    plugin.configs.recommended.rules["intentive-architecture/provider-only-cross-cutting"],
    "error",
  );
});

test("root ESLint config enables provider-only-cross-cutting", () => {
  const rootConfig = require("../../../eslint.config.cjs");
  assert.equal(rootConfig[0].rules["intentive-architecture/provider-only-cross-cutting"], "error");
  assert.equal(rootConfig[1].rules["intentive-architecture/provider-only-cross-cutting"], "error");
});

ruleTester.run("context-vocabulary", plugin.rules["context-vocabulary"], {
  valid: [
    {
      name: "canonical Control Plane term is allowed",
      filename: CONTROL_PLANE_CONFIG,
      code: 'export const owner = "Control Plane";',
    },
    {
      name: "canonical Shared Protocol term is allowed",
      filename: PROTOCOL_PACKAGE_SOURCE,
      code: 'export const owner = "Protocol";',
    },
    {
      name: "Expo framework reference is allowed",
      filename: MOBILE_AUTH_SOURCE,
      code: "// Expo Router owns replace() behavior here.\nexport const owner = true;",
    },
    {
      name: "Tauri framework reference is allowed",
      filename: DESKTOP_ONBOARDING_SOURCE,
      code: "// Tauri invoke() calls a Rust command by name.\nexport const owner = true;",
    },
  ],
  invalid: [
    {
      name: "Control Plane forbidden term reports owner and path",
      filename: CONTROL_PLANE_CONFIG,
      code: "// backend handoff\nexport const owner = true;",
      errors: [
        {
          message:
            'Vocabulary drift: "backend" belongs to Control Plane vocabulary. Use "Control Plane". Owner: services/control-plane/CONTEXT.md.',
        },
      ],
    },
    {
      name: "Shared forbidden term reports owner and path",
      filename: PROTOCOL_PACKAGE_SOURCE,
      code: "// wire format handoff\nexport const owner = true;",
      errors: [
        {
          message:
            'Vocabulary drift: "wire format" belongs to Shared vocabulary. Use "Protocol". Owner: packages/CONTEXT.md.',
        },
      ],
    },
    {
      name: "Mobile framework-as-product alias is forbidden",
      filename: MOBILE_AUTH_SOURCE,
      code: "// The Expo app routes to chat.\nexport const owner = true;",
      errors: [
        {
          message:
            'Vocabulary drift: "Expo app" belongs to Mobile Client vocabulary. Use "Mobile Client". Owner: apps/mobile/CONTEXT.md.',
        },
      ],
    },
    {
      name: "Desktop framework-as-product alias is forbidden",
      filename: DESKTOP_ONBOARDING_SOURCE,
      code: "// The Tauri app has no chat UI.\nexport const owner = true;",
      errors: [
        {
          message:
            'Vocabulary drift: "Tauri app" belongs to Desktop Client vocabulary. Use "Desktop Client". Owner: apps/desktop/CONTEXT.md.',
        },
      ],
    },
  ],
});

// ── filename-case util ──────────────────────────────────────────────────────

const { expectedCaseFor, matchesCase } = require("./lib/filename-case-util");

test("desktop .tsx components expect PascalCase", () => {
  assert.equal(
    expectedCaseFor("/x/apps/desktop/src/domains/onboarding/ui/Onboarding.tsx"),
    "PascalCase",
  );
});

test("mobile, services and packages expect kebab-case", () => {
  assert.equal(
    expectedCaseFor("/x/apps/mobile/src/domains/chat/ui/companion-chat.tsx"),
    "kebab-case",
  );
  assert.equal(
    expectedCaseFor("/x/services/agent-runtime/src/domains/gateway/service/auth-failure.ts"),
    "kebab-case",
  );
  assert.equal(expectedCaseFor("/x/packages/protocol/src/parse.ts"), "kebab-case");
});

test("desktop non-.tsx files expect kebab-case", () => {
  assert.equal(expectedCaseFor("/x/apps/desktop/src/domains/auth/service/auth.ts"), "kebab-case");
});

test("index/main entrypoints, .d.ts and tests are exempt", () => {
  assert.equal(expectedCaseFor("/x/apps/desktop/src/main.tsx"), null);
  assert.equal(expectedCaseFor("/x/packages/protocol/src/index.ts"), null);
  assert.equal(expectedCaseFor("/x/apps/desktop/src/vite-env.d.ts"), null);
  assert.equal(expectedCaseFor("/x/apps/desktop/src/__tests__/onboarding.test.tsx"), null);
  assert.equal(expectedCaseFor("/x/apps/mobile/test/companion-chat.rn.test.tsx"), null);
});

test("matchesCase validates Pascal and kebab", () => {
  assert.equal(matchesCase("Onboarding", "PascalCase"), true);
  assert.equal(matchesCase("onboarding", "PascalCase"), false);
  assert.equal(matchesCase("companion-chat", "kebab-case"), true);
  assert.equal(matchesCase("companionChat", "kebab-case"), false);
  assert.equal(matchesCase("auth", "kebab-case"), true);
});

const FILENAME_CASE_MESSAGE =
  /Rule violated: filename-case[\s\S]*Owning convention:[\s\S]*Example fix:/;

ruleTester.run("filename-case", plugin.rules["filename-case"], {
  valid: [
    {
      name: "desktop PascalCase component is allowed",
      filename: `${REPO_ROOT}/apps/desktop/src/domains/onboarding/ui/Onboarding.tsx`,
      code: "export const x = 1;",
    },
    {
      name: "mobile kebab-case file is allowed",
      filename: `${REPO_ROOT}/apps/mobile/src/domains/chat/ui/companion-chat.tsx`,
      code: "export const x = 1;",
    },
    {
      name: "index entrypoint is exempt",
      filename: `${REPO_ROOT}/packages/protocol/src/index.ts`,
      code: "export const x = 1;",
    },
  ],
  invalid: [
    {
      name: "desktop kebab-case .tsx component is rejected",
      filename: `${REPO_ROOT}/apps/desktop/src/domains/onboarding/ui/onboarding-screen.tsx`,
      code: "export const x = 1;",
      errors: [{ message: FILENAME_CASE_MESSAGE }],
    },
    {
      name: "mobile PascalCase file is rejected",
      filename: `${REPO_ROOT}/apps/mobile/src/domains/chat/ui/CompanionChat.tsx`,
      code: "export const x = 1;",
      errors: [{ message: FILENAME_CASE_MESSAGE }],
    },
  ],
});

// ── run ─────────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (err) {
    console.log(`  ✗ ${name}\n      ${err.message}`);
    fail++;
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
