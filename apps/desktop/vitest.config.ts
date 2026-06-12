import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: { plugins: [] },
  },
  // The shared `@intentive/*` packages are internal and never published; their
  // `exports` runtime entry (`default`) points at `dist/`, built only by turbo's
  // `^build`. The Desktop Vitest jobs (`desktop-ci`, `coverage`) run `vitest`
  // directly without that build, so resolve the packages through their `source`
  // export condition instead. This needs no per-package alias list (transitive
  // deps and future packages are covered automatically), exercises the *live*
  // Zod schemas with no stale dist, and the source sits outside `src/**` coverage.
  resolve: {
    conditions: ["source"],
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
