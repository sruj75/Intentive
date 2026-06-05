# Agent-Ready Assessment: Intentive

**Assessment date:** 2026-06-05 (codebase-readiness skill)

## Overall Agent-Ready Score: 79/100

**Rating: Agent-Assisted**

Agents can work productively here with human oversight on most changes. Progressive-disclosure docs (`AGENTS.md`, `CONTEXT-MAP.md`, per-deployable guides), strict TypeScript, Zod contracts, custom architecture lint (TS + Rust), and a ~4–5 minute blocking PR harness give reliable automated verification. Remaining gaps are **test depth** (31.6% file ratio, scaffold services, no coverage regression gate), **incomplete domain implementation** on control-plane and agent-runtime, and **no SAST/E2E**.

### Score Breakdown

| Dimension                 | Weight | Score  | Weighted   | Prior (2026-05-28) |
| ------------------------- | ------ | ------ | ---------- | ------------------ |
| Type Safety               | 20%    | 87/100 | 17.4       | 84                 |
| Test Foundation           | 15%    | 57/100 | 8.6        | 58                 |
| Documentation & Context   | 15%    | 88/100 | 13.2       | 86                 |
| Code Clarity              | 15%    | 84/100 | 12.6       | 78                 |
| Architecture Clarity      | 15%    | 76/100 | 11.4       | 63                 |
| Feedback Loops            | 10%    | 76/100 | 7.6        | 72                 |
| Consistency & Conventions | 5%     | 89/100 | 4.5        | 82                 |
| Change Safety             | 5%     | 74/100 | 3.7        | 70                 |
| **TOTAL**                 | 100%   |        | **79/100** | **74**             |

**Band movement:** 74 (Agent-Assisted) → **79 (Agent-Assisted)** — approaching the 85 Agent-Ready threshold.

---

## Codebase Snapshot

- **Primary language/framework:** TypeScript monorepo (pnpm/Turbo) + Rust (Tauri desktop), Expo mobile
- **Language tier:** statically-typed
- **Commit count:** 98 | **Contributors:** 2
- **Source files:** 190 | **Test files:** 60 (~31.6% test-to-source file ratio)
- **CI/CD:** GitHub Actions — `monorepo-foundation.yml` (`pnpm harness:ci`), `desktop-ci.yml`, `desktop-audit.yml`, `coverage.yml`, `harness-health.yml`, deploy workflows
- **Agent entry:** root `AGENTS.md` (66 lines) + **6** nested `AGENTS.md`; `CLAUDE.md` present (1-line `@AGENTS.md` import, currently untracked)
- **Lint/format:** ESLint 9 + `@intentive/eslint-plugin-architecture`, Prettier, Husky + lint-staged, Rust architecture linter
- **README:** 34 lines — delegates to `AGENTS.md`, `CONTEXT-MAP.md`, `docs/ARCHITECTURE.md`
- **Reproducibility:** `.devcontainer/devcontainer.json` (Node 20, pnpm, Rust, Tauri Linux deps)
- **Domains on disk:** `src/domains/` present across deployables (**81** domain-related files); desktop splits TS UI domains and Rust product domains

---

## Language Context: TypeScript (+ Rust)

Statically-typed weights apply. Type Safety reflects `strict: true` in `tsconfig.base.json`, zero explicit `any` in TS, Zod at `packages/protocol` and `packages/api-contract`, branded types in `packages/domain-types`, and full-workspace `pnpm typecheck` via Turbo.

---

## The Stripe Benchmark

Verification is strong for a pre-v1 monorepo: a green `monorepo-foundation` run implies typecheck, lint, format, architecture tests, contract-drift sensor, and workspace tests in under ~5 minutes. The limiter for agent scale is **oracle depth** (scaffold tests on backend deployables, no E2E, no coverage fail gate), not absence of a PR gate.

---

## Critical Findings

No dimension below 40. Highest-impact remaining gaps:

1. **Test Foundation (57)** — 31.6% test-to-source ratio; `services/control-plane` and `services/agent-runtime` mostly scaffold tests; coverage only for desktop JS with no `coverageThreshold` or CI fail-on-regression; no property-based or mutation testing.

2. **Architecture Clarity (76)** — Domain folders exist but backend deployables are types/scaffold-heavy; desktop product logic lives mainly in Rust while TS `src/domains/` is thin; docs still describe full six-layer trees not yet implemented everywhere.

3. **Feedback Loops (76)** — Sub-5-minute main gate is excellent; gaps are monolithic sequential job (no fail-fast split), Codecov non-blocking, audit-only security (no CodeQL/SAST), no per-PR preview environments.

---

## Verification Cost Profile

| Signal                       | Status  | What it means                                                    |
| ---------------------------- | ------- | ---------------------------------------------------------------- |
| Tests run in < 10 min        | Yes     | `monorepo-foundation` verify ~4–5 min (harness:ci)               |
| Security scanning automated  | Partial | `desktop-audit.yml` (pnpm + cargo audit); no CodeQL/SAST         |
| Property-based tests present | No      | —                                                                |
| Reproducible dev state       | Partial | devcontainer + frozen lockfile; no docker-compose / preview envs |
| Coverage reported on PRs     | Partial | `coverage.yml` → artifact + Codecov (`fail_ci_if_error: false`)  |

**Verification bottleneck:** Scaffold deployables pass CI with trivial tests; agents can change unimplemented domain paths without behavioral test signal until real handlers and integration tests land.

---

## What Improved Since Last Assessment (74 → 79)

| Change                                                                      | Impact                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/domains/` on disk (mobile, desktop Rust, control-plane, agent-runtime) | Architecture score +13; path-based navigation matches docs             |
| Codebase growth with maintained small files (~73 lines avg TS/RS)           | Code Clarity +6                                                        |
| Harness + contract-drift + harness-health PR comments                       | Change Safety +4; agent-oriented verification map in `docs/TESTING.md` |
| 44 ADR markdown files, active edits Jun 2026                                | Documentation +2                                                       |
| Stricter shared TS (`noUncheckedIndexedAccess`, etc.)                       | Type Safety +3                                                         |
| Custom ESLint architecture plugin + Rust parallel linter in CI              | Consistency +7                                                         |
| Dependabot (pnpm + Cargo), desktop audits, devcontainer                     | Feedback Loops +4                                                      |

**Resolved stale claim:** Prior assessment said `src/domains/` was “not on disk” — that is no longer true.

---

## Improvement Roadmap

### Quick Wins (1–2 days each)

- Add `coverageThreshold` in `apps/desktop/vitest.config.ts` at current baseline; make `coverage.yml` fail below threshold.
- Add short `packages/AGENTS.md` pointing to `packages/CONTEXT.md` and contract-change rules.
- Split `monorepo-foundation.yml` into parallel jobs (typecheck, lint, harness) with `fail-fast: true`.
- Extend README with a “Local setup” subsection (env vars, which deployables to run).

### High-Value Investments (1–4 weeks each)

- Real contract/integration tests as control-plane and agent-runtime handlers ship; replace scaffold-only assertions.
- Per-deployable coverage in Turbo + Codecov flags; optional Stryker on `packages/protocol` / `packages/api-contract`.
- GitHub CodeQL for TypeScript + Rust; add `test:rn` to default CI for mobile flows.
- `docs/DEPLOYMENT.md` (Cloud Run, GCE, EAS, desktop signing) linked from root `AGENTS.md`.
- Shared `@typescript-eslint/recommended` + React hooks rules per deployable (language-level lint beyond architecture plugin).

### Long-Term Architecture (ongoing)

- Finish desktop TS domain map aligned with Rust domains and wire protocol.
- Wire real feature-flag client through `packages/providers` when product needs flags.
- E2E harness for mobile ↔ runtime ↔ control-plane boundaries.
- Doc freshness sensor (ARCHITECTURE domain list vs `src/domains/` on disk).

---

## Dimension Details

### Test Foundation — **57/100** (−1)

- **Ratio:** 60 test files / 190 source files = **31.6%**
- **Coverage:** Vitest LCOV (desktop); Jest RN (mobile); no `coverageThreshold`; Codecov non-blocking
- **CI:** `pnpm harness:ci` in `monorepo-foundation.yml` (~4m 24s)
- **Pyramid:** Unit + contract + architecture tests + Rust domain `tests.rs`; no E2E; no fast-check/Stryker
- **Strengths:** Harness with hard-gated contract-drift; real JWKS integration tests in `packages/providers`; meaningful Rust tests on desktop capture/snapshots/summarization
- **Gaps:** Backend deployables mostly scaffold tests; mobile RN harness opt-in for some flows

### Feedback Loops — **76/100** (+4)

- **CI:** 9 workflows; pnpm + Rust caches; blocking gate under 5 min
- **Local:** Husky → lint-staged (Prettier + ESLint on staged app/service src)
- **Security:** Dependabot + `desktop-audit.yml`; no CodeQL
- **Extras:** `harness-health.yml` sticky PR comment for ready-for-review drift
- **Gaps:** Sequential monolithic verify job; no fail-fast; Codecov does not fail CI

### Documentation & Context — **88/100** (+2)

- Root `AGENTS.md` as 66-line TOC; **6** nested `AGENTS.md`; `CONTEXT-MAP.md` (112 lines); `docs/ARCHITECTURE.md` (268 lines); `docs/TESTING.md` (143 lines); **17** files under `docs/`; **44** ADR markdown files repo-wide
- CI: `docs:check` walks the whole repo validating both link targets **and** `#anchor` fragments (`process.exit(1)` on break) + `docs:context:test` (CONTEXT vocabulary, surfaces the canonical term in the error) — documentation coherence is mechanically gated, not aspirational
- ADRs are status-curated (accepted / superseded / amended / refined) and context-partitioned, so an agent won't re-propose a rejected approach; `CONTEXT-MAP.md` records ~13 flagged/rejected approaches with rationale
- **Gaps:** No `packages/AGENTS.md`; thin README setup; no `DEPLOYMENT.md` / `CONTRIBUTING.md`; advertised per-deployable `docs/plans/` convention is nearly empty

### Code Clarity — **84/100** (+6)

- ~126 TS/TSX/RS source files; **avg ~73 lines**; **0** files >1000 lines; **1** >500 (Rust test module)
- Path encodes domain + layer (`src/domains/<name>/{types,config,repo,service,runtime,ui}/`)
- **Gaps:** Desktop TS vs Rust split; many domains scaffold-only without status markers

### Consistency & Conventions — **89/100** (+7)

- Custom `@intentive/eslint-plugin-architecture` (layer-direction, no-cross-deployable, context-vocabulary) + Rust architecture linter; all enforced in `harness:ci`
- Prettier + `format:check` in CI; strict `tsconfig.base.json`
- **Gaps:** No `typescript-eslint` recommended rules or React ESLint at deployable level

### Type Safety — **87/100** (+3)

- `strict: true`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`; **0** explicit `any` in TS
- Zod `.strict()` contracts in `packages/protocol` and `packages/api-contract`
- **Gaps:** No lint rule for `no-explicit-any`; few runtime `.parse()` calls at service boundaries yet

### Architecture Clarity — **76/100** (+13)

- Four deployables match `docs/ARCHITECTURE.md`; domains visible in filesystem; mechanical layer + vocabulary lint
- **Gaps:** control-plane/agent-runtime aspirational vs implemented layers; desktop logic concentrated in Rust; feature flags stub only

### Change Safety — **74/100** (+4)

- Contract-drift sensor, architecture lint tests, impact-radius advisory sensor, Husky on changed src
- **Gaps:** High doc churn co-change; scaffold tests mask unimplemented domains; no coverage regression gate

---

## For continuous tracking

Consider [`btar`](https://github.com/jaredmcfarland/btar) for daily enforcement of types, lint, and coverage metrics alongside this strategic baseline.

```bash
npm install -g btar
btar analyze .
btar context generate agents-md
```

---

_Generated by codebase-readiness skill — claude-code-workflows_
