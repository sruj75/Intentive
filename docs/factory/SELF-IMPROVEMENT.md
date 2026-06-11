# Factory Self-Improvement Runbook

Use this runbook when a Radar report points to factory work: docs, tests, sensors, workflows, backlog, ledger, or decisions.

## Hard Rules

1. **Recommendation pass first.** Do not edit tracked files until I approve specific items.
2. Write recommendations to `.context/factory-recommendations.md`.
3. Wait for explicit human approval.
4. Implement only approved items.
5. Update docs and tests together when factory behavior changes.
6. Never mark a finding accepted, backlogged, or factory-improved without human approval.
7. Do not weaken a Gate without explicit human approval.

## Inputs

- A copied PR Radar comment or saved `factory-report.md`
- [`LEDGER.md`](LEDGER.md) for prior decisions
- [`BACKLOG.md`](BACKLOG.md) and [`decisions/`](decisions/) for approved follow-up and rationale

## Recommendation Pass

If starting from a saved report, generate a draft:

```bash
pnpm factory:recommend --report <saved-report.md>
```

For each material finding, write:

```text
Finding
Observed signal
Why it matters
Prior decision or history
Recommended classification
Recommended action
Risk
Approval needed
Likely files
```

Use these approval levels:

- **automatic**: broken report formatting, fixture coverage, disappeared-finding cleanup
- **agent-suggested**: docs, allowlists with tests, backlog entries, lint guidance
- **human-approved**: Gate changes, suppressions, product vocabulary, architecture rule changes, accepted/backlogged/factory-improved statuses

Escalation:

- seen once: report only
- seen twice: recommend classification
- seen 3+ times unclassified: recommend backlog or factory improvement

After writing recommendations, stop and report what needs approval. Do not edit tracked files yet.

## Implementation Pass

After approval, make only the approved changes.

Common outputs:

- docs updates in `docs/FACTORY.md`, `docs/factory/`, `AGENTS.md`, or `CONTEXT.md`
- sensor or lint changes under `tools/`
- fixture tests for changed factory behavior
- backlog entries in [`BACKLOG.md`](BACKLOG.md)
- decision records in [`decisions/`](decisions/)
- approved ledger rationale in [`LEDGER.md`](LEDGER.md)

Run the relevant checks:

```bash
pnpm sensor:factory-report:test
pnpm factory:test
pnpm docs:factory:test
pnpm docs:check
pnpm harness:test
pnpm format:check
```

Refresh the ledger from a saved report when needed:

```bash
pnpm factory:ledger --report <saved-report.md>
```

## Manual Prompt

```text
Read docs/factory/SELF-IMPROVEMENT.md.
Here is the PR Radar comment:
<paste comment>

First, write recommendations only.
Do not edit tracked files until I approve specific items.
```
