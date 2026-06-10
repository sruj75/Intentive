# Factory Operations

This folder is the long-term memory and runbook for Intentive's self-improving factory.

The factory is not just the checks that run on pull requests. It is the system that remembers repeated problems, recommends durable improvements, and lets humans approve the changes that make future agent work easier.

For purpose, mental model, and factory rules, see [`docs/FACTORY.md`](../FACTORY.md). For command reference and sensor timing, see [`docs/TESTING.md`](../TESTING.md).

## How the loop works

```text
PR gets a sticky factory comment
You copy that comment into a Conductor agent
The agent reads docs/factory/SELF-IMPROVEMENT.md
The agent writes recommendations first
You approve selected recommendations
The agent updates docs, tests, sensors, or backlog items
The ledger remembers what happened
The next PR starts with a better factory
```

Or generate a draft first:

```bash
pnpm sensor:factory-report --output factory-report.md
pnpm factory:recommend --report factory-report.md
```

Then open `.context/factory-recommendations.md`, approve what you want, and tell the agent to implement only those items.

## Files in this folder

| File                                         | Purpose                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| [`SELF-IMPROVEMENT.md`](SELF-IMPROVEMENT.md) | Agent runbook. Point a Conductor agent here after pasting a PR factory comment. |
| [`LEDGER.md`](LEDGER.md)                     | Factory memory for recurring findings, statuses, owners, and rationale.         |
| [`BACKLOG.md`](BACKLOG.md)                   | Approved factory improvements that are not done yet.                            |
| [`decisions/`](decisions/)                   | ADR-style records for important factory decisions.                              |

## Commands

Full command catalog: [`docs/TESTING.md`](../TESTING.md).

Factory-specific commands:

```bash
pnpm sensor:factory-report
pnpm factory:ledger
pnpm factory:recommend --report factory-report.md
pnpm factory:test
pnpm docs:factory:test
```

- `pnpm sensor:factory-report` creates the sticky PR comment input.
- `pnpm factory:ledger` refreshes finding counts in `LEDGER.md` without overwriting human classifications stored in the JSON `entries` block.
- `pnpm factory:recommend --report <file>` writes `.context/factory-recommendations.md` for the recommendation-only agent pass.

## Finding IDs

Findings use stable IDs across PRs, for example:

```text
stale-scaffold:apps/mobile/src/scaffold.ts
vocabulary:apps/mobile/app/index.tsx:bot:companion
untested-export:packages/protocol/src/index.ts:sessionmessage
```

The report uses those IDs plus ledger memory to show whether a finding is new, repeated, accepted, backlogged, or already handled.

## PR classification

Before merging a non-trivial change, classify each material factory-report finding as one of:

| Classification       | Meaning                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| **Fixed now**        | The current change removes the drift.                                                                   |
| **Factory improved** | The current change adds or sharpens a guide, sensor, test, or workflow.                                 |
| **Backlogged**       | Record the improvement in [`BACKLOG.md`](BACKLOG.md) with ledger links.                                 |
| **Accepted**         | The finding is intentionally tolerated; document rationale in the ledger or [`decisions/`](decisions/). |

Escalation rule for unclassified repeated findings:

- seen once: report only
- seen twice: recommend classification
- seen 3+ times unclassified: recommend backlog or factory improvement

## Approval levels

**Safe for an agent to do automatically**

- Fix broken report formatting
- Add missing sensor fixture coverage
- Mark disappeared findings as fixed in the ledger

**Agent may draft, human should approve**

- Update `AGENTS.md`, `FACTORY.md`, or factory docs
- Add vocabulary allowlist entries with tests
- Add backlog items
- Add or sharpen lint guidance

**Human must decide first**

- Weaken architecture rules
- Suppress recurring findings without rationale
- Change what blocks CI
- Auto-open GitHub issues

## Manual Conductor prompt

```text
Read docs/factory/SELF-IMPROVEMENT.md.
Here is the PR factory sticky comment:
<paste comment>

First, write recommendations only.
Do not edit tracked files until I approve specific items.
```
