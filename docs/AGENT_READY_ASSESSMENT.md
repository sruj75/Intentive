# Agent-Ready Codebase Assessment

Assessment date: 2026-07-23

## Executive Summary

Intentive is a mixed TypeScript/JavaScript and native Swift monorepo. The former
Tauri/Rust Desktop implementation and its Python asset helper have been removed.
The maintained source-language security contract is therefore:

- GitHub Actions
- JavaScript/TypeScript
- Swift

The repository has strong progressive-disclosure documentation, shared wire
contracts, architectural lint, deployable harness templates, and meaningful
behavior tests. The principal readiness risk is no longer missing verification;
it is keeping verification trustworthy, non-duplicated, and aligned with the
current product topology.

## Current Toolchain

- Package manager: pnpm 11
- Node runtime: Node 24 in CI
- Monorepo orchestration: Turbo
- Mobile: Expo / React Native / TypeScript
- Desktop: SwiftPM / SwiftUI / AppKit
- Control Plane and Agent Runtime: Node / TypeScript
- Local Desktop build storage: `apps/desktop/macos/scripts/swiftpm.sh`

## Verification Architecture

### Blocking Gate

`.github/workflows/monorepo-foundation.yml` runs three independent modules and
joins them behind the stable `Gate` status:

1. `repo-contracts` on Ubuntu
   - documentation and architecture lint
   - formatting
   - CI/harness/sensor fixture contracts
   - Protocol/API contract drift
2. `node-workspaces` on Ubuntu
   - TypeScript workspace typecheck
   - workspace tests
   - Mobile React Native tests
3. `desktop-swift` on macOS
   - SwiftPM tests
   - assembled bundle contract
   - reviewable LLVM coverage JSON and summary

Local `pnpm harness` composes the same modules. Each can be run independently
with `pnpm harness --group <name>`.

### Security

- Versioned CodeQL workflow for Actions, JavaScript/TypeScript, and Swift
- Production dependency audit on dependency-changing pull requests
- Full dependency audit weekly and on demand
- Desktop provider-SDK dependency policy
- Dependabot for npm and GitHub Actions

Known-vulnerability exceptions live in `pnpm-workspace.yaml` and require
reachability rationale. GitHub CodeQL default setup must remain disabled; the
repository-owned workflow is the source of truth.

### Integration and Release

- Neon preview branches validate Control Plane migrations.
- Server deploy workflows test before deployment and smoke the promoted runtime.
- Desktop release is one evidence-bound state machine:
  merged SHA -> candidate acceptance -> approval -> signed draft -> protected
  dedicated-Mac Stage 2 proof -> publish.
- Only the Stage 2 job may move a Desktop release from draft to published.

### Advisory Radar

Factory Radar is changed-file-first. It reports repeated or returned findings and
keeps full repository drift behind `--audit`. It does not run unpinned third-party
analyzers or present unsupported coverage scores.

## Strengths

- Shared Protocol and HTTP schemas are mechanically protected against local
  redefinition.
- Auth, telemetry, and feature flags enter through Providers.
- Desktop product behavior is testable through SwiftPM Core seams.
- Mobile includes both Node and React Native behavior suites.
- Release evidence is bound to immutable SHAs and artifact digests.
- CI shell prerequisites are mechanically checked against the baseline runner.

## Remaining Risks

- Swift concurrency warnings that become errors in Swift 6 should be burned down
  before changing the package language mode.
- The stable `Gate` and `Security` statuses are not merge requirements until the
  rebuilt workflows have passed representative pull requests and the repository
  ruleset is enabled.
- Coverage is review evidence rather than a blocking percentage. This is
  intentional; changed-behavior proof is more useful than a global target.
- Dedicated-Mac and Tart acceptance depend on correctly maintained external
  runner grants and driver configuration.

## Reassessment Triggers

Refresh this document when:

- a maintained implementation language is added or removed;
- a deployable changes build system;
- Gate module ownership changes;
- a release can transition through a new path;
- merge rules begin requiring different aggregator statuses.
