# Git Hooks

The commit hook protects the staged index. It should stay fast, deterministic,
and aligned with CI-owned checks.

`tools/hooks/run-pre-commit.sh` runs:

1. `tools/hooks/check-staged.mjs` for cheap safety rails:
   - no direct commits on `main` or `master`
   - `git diff --cached --check` for whitespace errors and conflict markers
   - no staged files over 500KB
   - no `debugger` statements in staged JS/TS source
2. `pnpm lint-staged` for staged formatting and architecture linting.

`lint-staged` intentionally mirrors the root format/lint surfaces: Prettier
covers the same extensions as `pnpm format:check`, and ESLint includes
`apps/`, `services/`, and `packages/` source files.

There is no automatic pre-push hook yet. Use `pnpm harness` or
`pnpm harness --scope <deployable>` before handoff; add a pre-push hook only
after the affected-test mapping is proven against shared packages, Rust, docs,
and the existing harness sensors.
