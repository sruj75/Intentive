# CI Advisory Suppressions

Decision date: 2026-06-10

## Context

The factory report flags workflow suppressions such as `continue-on-error: true` and scoped audit ignores. Some of these are intentional CI trade-offs, not architecture drift.

## Decisions

### Impact radius stays advisory in CI

`pnpm sensor:impact-radius` runs in `monorepo-foundation.yml` with `continue-on-error: true` because it is a review-triage signal, not a merge gate.

Ledger ID: `suppression:.github/workflows/monorepo-foundation.yml:44:workflow-continue-on-error`

Status: **accepted**

Rationale: The sensor helps humans prioritize review. It should not block merges while the repo is still maturing.

### Desktop audit ignores are scoped

Desktop audit workflows may ignore known RUSTSEC entries while upstream fixes are tracked separately.

Ledger ID: `suppression:.github/workflows/desktop-audit.yml:39:audit/dependency ignore`

Status: **accepted**

Rationale: Audit ignores are scoped to known upstream risk with separate tracking, not a blanket mute.

## Follow-up

Revisit if either suppression hides a recurring real defect instead of a known trade-off.
