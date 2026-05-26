'use strict';

// Pure-Node self-test for the path parser and layer-rule logic.
// Runs without ESLint installed: `node tools/linters/.../test.js`.

const assert = require('node:assert/strict');
const { parseDomainPath } = require('./lib/path-parser');
const { canImport } = require('./lib/layer-rules');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ── parseDomainPath ─────────────────────────────────────────────────────────

test('parses a Mobile Client domain path', () => {
  assert.deepEqual(
    parseDomainPath('/x/Hey Intentive/apps/mobile/src/domains/chat/service/sendMessage.ts'),
    { kind: 'apps', deployable: 'mobile', domain: 'chat', layer: 'service' },
  );
});

test('parses an Agent Runtime domain path', () => {
  assert.deepEqual(
    parseDomainPath('/x/services/agent-runtime/src/domains/gateway/runtime/handler.ts'),
    { kind: 'services', deployable: 'agent-runtime', domain: 'gateway', layer: 'runtime' },
  );
});

test('parses a Desktop Tauri (Rust) domain path', () => {
  assert.deepEqual(
    parseDomainPath('/x/apps/desktop/src-tauri/src/domains/capture/repo/sqlite.rs'),
    { kind: 'apps', deployable: 'desktop', domain: 'capture', layer: 'repo' },
  );
});

test('returns null for non-domain paths', () => {
  assert.strictEqual(
    parseDomainPath('/x/apps/mobile/src/utils/helper.ts'),
    null,
  );
  assert.strictEqual(
    parseDomainPath('/x/packages/protocol/src/index.ts'),
    null,
  );
  assert.strictEqual(parseDomainPath(''), null);
  assert.strictEqual(parseDomainPath(undefined), null);
});

// ── canImport ───────────────────────────────────────────────────────────────

test('service may import repo (forward, lower layer)', () => {
  assert.strictEqual(canImport('service', 'repo'), true);
});

test('service may not import runtime (backward)', () => {
  assert.strictEqual(canImport('service', 'runtime'), false);
});

test('service may not import ui (backward, two steps)', () => {
  assert.strictEqual(canImport('service', 'ui'), false);
});

test('same-layer imports are allowed', () => {
  assert.strictEqual(canImport('service', 'service'), true);
});

test('any layer may import providers (cross-cutting)', () => {
  assert.strictEqual(canImport('types', 'providers'), true);
  assert.strictEqual(canImport('ui', 'providers'), true);
});

test('types may not import anything else in the layer order', () => {
  assert.strictEqual(canImport('types', 'config'), false);
  assert.strictEqual(canImport('types', 'repo'), false);
});

test('ui may import everything below it', () => {
  for (const lower of ['types', 'config', 'repo', 'service', 'runtime']) {
    assert.strictEqual(canImport('ui', lower), true, `ui → ${lower}`);
  }
});

test('unknown layers do not trip the rule (benefit of the doubt)', () => {
  assert.strictEqual(canImport('service', 'unknown'), true);
  assert.strictEqual(canImport('unknown', 'service'), true);
});

// ── ESLint integration tests via RuleTester ─────────────────────────────────
// Verify the rules actually fire end-to-end when ESLint runs them against
// real TypeScript source with domain-shaped filenames.

const { RuleTester } = require('eslint');
const tsParser = require('@typescript-eslint/parser');
const plugin = require('./index.js');

// RuleTester normally uses Mocha-style globals. Adapt it to the simple
// pass/fail runner this file already uses.
RuleTester.describe = (name, fn) => fn();
RuleTester.it = (name, fn) => tests.push([`integration: ${name}`, fn]);
RuleTester.itOnly = RuleTester.it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
});

const MOBILE_CHAT_SERVICE = '/repo/apps/mobile/src/domains/chat/service/sendMessage.ts';
const MOBILE_CHAT_TYPES = '/repo/apps/mobile/src/domains/chat/types/index.ts';

ruleTester.run(
  'layer-direction',
  plugin.rules['layer-direction'],
  {
    valid: [
      {
        name: 'service may import repo (forward, same domain)',
        filename: MOBILE_CHAT_SERVICE,
        code: "import { db } from '../repo/db';",
      },
      {
        name: 'workspace-name import (packages/) is never flagged',
        filename: MOBILE_CHAT_SERVICE,
        code: "import { userMessage } from '@intentive/protocol';",
      },
      {
        name: 'types may import providers (cross-cutting allowed)',
        filename: MOBILE_CHAT_TYPES,
        code: "import { auth } from '../providers/auth';",
      },
    ],
    invalid: [
      {
        name: 'service importing runtime is a backwardImport',
        filename: MOBILE_CHAT_SERVICE,
        code: "import { handler } from '../runtime/handler';",
        errors: [{ messageId: 'backwardImport' }],
      },
      {
        name: 'service reaching into another domain is a crossDomainImport',
        filename: MOBILE_CHAT_SERVICE,
        code: "import { token } from '../../auth/repo/token';",
        errors: [{ messageId: 'crossDomainImport' }],
      },
    ],
  },
);

ruleTester.run(
  'no-cross-deployable',
  plugin.rules['no-cross-deployable'],
  {
    valid: [
      {
        name: 'workspace-name import does not trip the rule',
        filename: MOBILE_CHAT_SERVICE,
        code: "import { x } from '@intentive/protocol';",
      },
      {
        name: 'same-deployable relative import is fine',
        filename: MOBILE_CHAT_SERVICE,
        code: "import { db } from '../repo/db';",
      },
    ],
    invalid: [
      {
        name: 'mobile reaching into desktop by relative path is a crossDeployable',
        filename: MOBILE_CHAT_SERVICE,
        code: "import { foo } from '../../../../../desktop/src/domains/capture/service/foo';",
        errors: [{ messageId: 'crossDeployable' }],
      },
    ],
  },
);

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
