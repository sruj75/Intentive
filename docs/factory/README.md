# Factory Operations

This folder holds factory memory and the runbook for approved factory improvements.

For the operating model, read [`docs/FACTORY.md`](../FACTORY.md). For verification commands, read [`docs/TESTING.md`](../TESTING.md).

## Files

| File                                         | Purpose                                                     |
| -------------------------------------------- | ----------------------------------------------------------- |
| [`SELF-IMPROVEMENT.md`](SELF-IMPROVEMENT.md) | The recommendation-first runbook for changing the factory.  |
| [`LEDGER.md`](LEDGER.md)                     | Machine-readable finding memory with a short human summary. |
| [`BACKLOG.md`](BACKLOG.md)                   | Approved factory improvements that are not done yet.        |
| [`decisions/`](decisions/)                   | Rationale for intentional factory trade-offs.               |

## Commands

```bash
pnpm sensor:factory-report --base origin/main
pnpm sensor:factory-report --base origin/main --audit
pnpm factory:recommend --report factory-report.md
pnpm factory:ledger --report factory-report.md
```

- `sensor:factory-report` is Radar: PR review attention, not a merge gate.
- `--audit` includes full repo-wide sensor details for maintenance.
- `factory:recommend` writes `.context/factory-recommendations.md`.
- `factory:ledger` refreshes `LEDGER.md` while preserving human-approved statuses.

## Rule

Factory changes that affect rules, gates, suppressions, or human classifications need explicit human approval. Use `SELF-IMPROVEMENT.md` before editing tracked files.
