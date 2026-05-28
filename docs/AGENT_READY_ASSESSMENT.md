# Agent-Ready Assessment: Hey Intentive

**Assessment date:** 2026-05-28 (revised after readiness 80/20 pass)

## Overall Agent-Ready Score: 74/100
**Rating: Agent-Assisted**

Agents can work productively here with human oversight on most changes. Documentation, strict contracts, and a truthful PR gate (typecheck, lint, format, architecture tests, and `pnpm test`) give reliable automated verification. Remaining gaps are architectural (documented `src/domains/` not on disk), shallow tests on three scaffolds, and no coverage regression gate.

### Score Breakdown

| Dimension                 | Weight | Score   | Weighted | Prior |
|---------------------------|--------|---------|----------|-------|
| Type Safety               | 20%    | 84/100  | 16.8     | 81    |
| Test Foundation           | 15%    | 58/100  | 8.7      | 42    |
| Documentation & Context   | 15%    | 86/100  | 12.9     | 83    |
| Code Clarity              | 15%    | 78/100  | 11.7     | 78    |
| Architecture Clarity      | 15%    | 63/100  | 9.5      | 63    |
| Feedback Loops            | 10%    | 72/100  | 7.2      | 48    |
| Consistency & Conventions | 5%     | 82/100  | 4.1      | 70    |
| Change Safety             | 5%     | 70/100  | 3.5      | 68    |
| **TOTAL**                 | 100%   |         | **74/100** | **68** |

**Band movement:** 68 (Agent-Supervised) → **74 (Agent-Assisted)**

---

## Codebase Snapshot

- **Primary language/framework:** TypeScript monorepo (pnpm/Turbo) + Rust (Tauri desktop)
- **Language tier:** statically-typed
- **Commit count:** 67 | **Contributors:** 2
- **Source files:** ~63 | **Test artifacts:** ~20 (~32% test-to-source file ratio)
- **CI/CD:** GitHub Actions — `monorepo-foundation.yml` (typecheck, lint, format, arch tests, test), `desktop-ci.yml`, `desktop-audit.yml`, `coverage.yml`, deploy workflows
- **Agent entry:** `AGENTS.md` (65 lines); no `CLAUDE.md`
- **Lint/format:** ESLint + custom architecture plugin, Prettier, Husky + lint-staged
- **README:** 34 lines with deployable pointers and verification commands
- **Reproducibility:** `.devcontainer/devcontainer.json` (Node 20, pnpm, Rust, Tauri Linux deps)

---

## Language Context: TypeScript (+ Rust)

Statically-typed weights apply. Type Safety reflects `strict: true`, zero `any` in TS, Zod at `packages/protocol` and `packages/api-contract`, and desktop frontend now included in root `pnpm typecheck`.

---

## The Stripe Benchmark

Verification is materially better than the prior baseline: a green root PR run now implies tests executed, not only types and lint. The remaining limiter for scale is **depth** (scaffold tests, no E2E) and **architecture/docs drift** (`src/domains/` documented but not present), not absence of a test gate.

---

## Critical Findings

No dimension below 40. Highest-impact remaining gaps:

1. **Architecture Clarity (63)** — Docs and ESLint target `src/domains/<domain>/<layer>/`; desktop and scaffolds use flat or minimal layouts. Agents must read deployable `AGENTS.md` and desktop module maps, not path conventions alone.

2. **Test Foundation (58)** — CI runs full `pnpm test` including ~101 Rust unit tests and contract tests, but mobile/control-plane/runtime tests are minimal scaffolds; no E2E; coverage uploaded separately without fail-on-regression.

3. **Feedback Loops (72)** — Strong root gate plus Dependabot, audits, pre-commit, and devcontainer; desktop checks are path-filtered workflows, not all on every PR file change.

---

## Verification Cost Profile

| Signal | Status | What it means |
|--------|--------|----------------|
| Tests run in < 10 min | Yes | Root `verify` job runs full test suite with Rust deps on Ubuntu |
| Security scanning automated | Partial | `desktop-audit.yml` (pnpm + cargo audit) on desktop-related PR paths |
| Property-based tests present | No | — |
| Reproducible dev state | Partial | devcontainer + frozen lockfile; no per-PR preview envs |
| Coverage reported on PRs | Partial | `coverage.yml` uploads artifact + Codecov (no regression gate) |

**Verification bottleneck:** Scaffold deployables pass CI with trivial tests; agents can break unimplemented domains without test signal until real domains land.

---

## What Improved Since Last Assessment (68 → 74)

| Change | Impact |
|--------|--------|
| `pnpm test` + Rust deps in `monorepo-foundation.yml` | Tests are a PR oracle |
| Full `cargo test` in desktop `test` script | No filtered Rust subset locally/CI |
| Root `desktop-ci.yml` / `desktop-audit.yml` | Desktop frontend + Rust + audits at repo level |
| Scaffold tests on all four deployables | Turbo `test` covers whole workspace |
| `docs/TESTING.md`, README pointers | Clear verification map |
| Prettier + `format:check` in CI + Husky | Style drift caught early |
| Dependabot (pnpm + Cargo) | Dependency signal |
| `coverage.yml` + Vitest LCOV | JS coverage visibility |
| Desktop `typecheck` in Turbo graph | Frontend TS in root typecheck |
| `.devcontainer/devcontainer.json` | Reproducible agent environment |

---

## Improvement Roadmap

### Quick Wins (still worthwhile)

- Link `docs/TESTING.md` from each deployable `AGENTS.md` one-liner.
- Add `typecheck` to mobile if Expo TS surface grows beyond scaffold.

### Deferred (intentional 80/20)

- Desktop domain migration to `src/domains/`.
- Real contract/integration tests as domains land.
- CONTEXT vocabulary + protocol version lint (backlog #46).
- Real feature-flag provider.
- Codecov fail-on-regression thresholds.
- Rust coverage via `cargo llvm-cov`.

---

## Dimension Details

### Test Foundation — **58/100** (+16)

- **Ratio:** ~20 test files / ~63 source files ≈ **32%**
- **CI:** `pnpm test` required in `monorepo-foundation.yml`
- **Pyramid:** Unit + contract + architecture plugin tests; no E2E
- **Desktop:** Vitest (13) + full Cargo lib tests (~101 passed, 1 ignored)
- **Scaffolds:** mobile, control-plane, agent-runtime each have 1–2 Node scaffold tests
- **Gaps:** No coverage thresholds in foundation CI; scaffold tests do not exercise domain logic

### Feedback Loops — **72/100** (+24)

- **Root PR gate:** typecheck, lint, docs link check, format, arch plugin tests, test
- **Additional:** `desktop-ci.yml`, `desktop-audit.yml`, `coverage.yml`, Dependabot
- **Local:** Husky + lint-staged; devcontainer for Linux parity
- **Gaps:** Path-filtered desktop workflows; Codecov does not fail CI on drop

### Documentation & Context — **86/100** (+3)

- `AGENTS.md`, `docs/CONTEXT.md`, `docs/ARCHITECTURE.md`, **36 ADRs**, `docs/TESTING.md`
- **6** nested `AGENTS.md` files; README deployable pointers
- Markdown link check in `pnpm lint`
- No `CLAUDE.md` (AGENTS.md fills role well)

### Code Clarity — **78/100** (unchanged)

- Small focused files; no god files >500 lines in product code
- Docs vs filesystem mismatch for domain paths remains

### Consistency & Conventions — **82/100** (+12)

- Prettier enforced in CI; Husky on commit
- Custom `@intentive/eslint-plugin-architecture` with CI test suite
- Architecture rules still mostly target not-yet-migrated `domains/` paths

### Type Safety — **84/100** (+3)

- `strict: true`, `noUncheckedIndexedAccess`, **0** `any` in TS
- Zod contracts + contract tests; desktop in root typecheck
- `z.unknown()` on two protocol fields; stub deployables thin

### Architecture Clarity — **63/100** (unchanged)

- Clear monorepo deployable boundaries; 36 ADRs
- `src/domains/` not on disk; ESLint path-parser ahead of code

### Change Safety — **70/100** (+2)

- Import/layer rules tested in CI; additive SQLite migration only
- Feature flags stub only; no production flag usage

---

## For continuous tracking

Consider [`btar`](https://github.com/jaredmcfarland/btar) for daily enforcement of types, lint, and coverage metrics alongside this strategic baseline.

```bash
npm install -g btar
btar analyze .
btar context generate agents-md
```

---
*Generated by codebase-readiness skill — claude-code-workflows*
