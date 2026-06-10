# Factory

This folder is the long-term memory and runbook for Intentive's self-improving factory.

The factory is not just the checks that run on pull requests. It is the system that remembers repeated problems, recommends durable improvements, and lets humans approve the changes that make future agent work easier.

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

## Files in this folder

| File                                         | Purpose                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| [`SELF-IMPROVEMENT.md`](SELF-IMPROVEMENT.md) | Agent runbook. Point a Conductor agent here after pasting a PR factory comment. |
| [`LEDGER.md`](LEDGER.md)                     | Factory memory for recurring findings, statuses, owners, and rationale.         |
| [`BACKLOG.md`](BACKLOG.md)                   | Approved factory improvements that are not done yet.                            |
| [`decisions/`](decisions/)                   | ADR-style records for important factory decisions.                              |

## Commands

```bash
pnpm sensor:factory-report
pnpm factory:ledger
pnpm factory:recommend --report factory-report.md
```

- `pnpm sensor:factory-report` creates the sticky PR comment input.
- `pnpm factory:ledger` refreshes finding counts in `LEDGER.md` without overwriting human classifications.
- `pnpm factory:recommend --report <file>` writes `.context/factory-recommendations.md` for the recommendation-only agent pass.

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

See also [`docs/FACTORY.md`](../FACTORY.md) for the full operating model.
