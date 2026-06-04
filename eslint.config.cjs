"use strict";

/**
 * Root ESLint config for the Intentive monorepo (ESLint 9+ flat config).
 *
 * Only the Intentive architecture rules are wired here. Each deployable
 * stays responsible for its own language-level rules (TypeScript strictness,
 * React conventions, etc.) — those live alongside the deployable.
 *
 * Run: `pnpm lint`  (after `pnpm install` at the repo root).
 */

const architecture = require("@intentive/eslint-plugin-architecture");
const tsParser = require("@typescript-eslint/parser");

module.exports = [
  {
    files: [
      "apps/*/src/**/*.{ts,tsx,mts,cts}",
      "services/*/src/**/*.{ts,tsx,mts,cts}",
      "packages/*/src/**/*.{ts,tsx,mts,cts}",
    ],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      "intentive-architecture": architecture,
    },
    rules: {
      "intentive-architecture/layer-direction": "error",
      "intentive-architecture/no-cross-deployable": "error",
      "intentive-architecture/context-vocabulary": "error",
    },
  },
  {
    files: [
      "apps/*/src/**/*.{js,jsx,mjs,cjs}",
      "services/*/src/**/*.{js,jsx,mjs,cjs}",
      "packages/*/src/**/*.{js,jsx,mjs,cjs}",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      "intentive-architecture": architecture,
    },
    rules: {
      "intentive-architecture/layer-direction": "error",
      "intentive-architecture/no-cross-deployable": "error",
      "intentive-architecture/context-vocabulary": "error",
    },
  },
  {
    // The plugin's own test fixtures and unit test live outside the layer rule.
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.next/**",
      "**/.expo/**",
      "**/target/**",
      "apps/desktop/src-tauri/target/**",
      "tools/linters/**/test.js",
    ],
  },
];
