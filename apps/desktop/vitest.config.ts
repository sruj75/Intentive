import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Resolve the shared contract packages to their TypeScript source. Their
// package `exports` map points `default` at `dist/`, which is only built by
// turbo's `^build` — but the Desktop Vitest jobs (`desktop-ci`, `coverage`)
// run `vitest` directly without that build step, so a dist-based import fails
// to resolve. Pointing at source also makes `protocol-contract.test.ts` exercise
// the *live* Zod schemas (no stale dist) and is naturally excluded from the
// `src/**` coverage scope.
const pkgSource = (relPath: string) => fileURLToPath(new URL(relPath, import.meta.url));

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: { plugins: [] },
  },
  resolve: {
    alias: {
      "@intentive/protocol": pkgSource("../../packages/protocol/src/index.ts"),
      "@intentive/boundary": pkgSource("../../packages/boundary/src/index.ts"),
      "@intentive/domain-types": pkgSource("../../packages/domain-types/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.{test,spec}.{ts,tsx}", "src/vite-env.d.ts"],
      reporter: ["text", "lcov"],
      reportsDirectory: "../../coverage/apps/desktop",
      // Regression gate. Set a few points below the current baseline
      // (stmts 91 / branch 78 / funcs 100 / lines 92) so normal churn passes
      // but a real drop fails `vitest run --coverage` (and thus coverage.yml).
      // Ratchet these up as coverage improves.
      thresholds: {
        statements: 85,
        branches: 70,
        functions: 90,
        lines: 85,
      },
    },
  },
});
