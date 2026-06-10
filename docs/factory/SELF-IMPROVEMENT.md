# Factory Self-Improvement Runbook

Use this file as the agent skill for factory self-improvement runs in Conductor.

## Goal

Turn a PR factory sticky comment into approved factory improvements.

Do not treat this as "fix today's code only." The point is to improve the system that caused repeated problems: docs, tests, sensors, workflows, and backlog items.

## Inputs you will receive

1. A copied PR factory sticky comment, or a saved `factory-report.md`
2. This runbook
3. The current factory memory in [`LEDGER.md`](LEDGER.md) and [`BACKLOG.md`](BACKLOG.md)

## Hard rules

1. **Recommendation pass first.** On the first pass, do not edit tracked files.
2. Write recommendations to `.context/factory-recommendations.md`.
3. Wait for explicit human approval of specific recommendation items.
4. Only implement approved items.
5. Any factory rule change must update the relevant docs and tests together.
6. Never mark a finding accepted, backlogged, or factory-improved in the ledger without human approval.
7. Prefer small durable improvements over broad rule weakening.

## Step 1: Read the handoff

Read the pasted factory comment and identify:

- new findings
- repeated findings
- findings already classified in the ledger
- findings waiting for classification

If helpful, run:

```bash
pnpm factory:recommend --report <saved-report.md>
```

Use the generated `.context/factory-recommendations.md` as your starting draft, then refine it.

## Step 2: Write recommendations only

For each material finding, write:

```text
Finding
Why it matters
What has happened before
Recommended action
Risk
Approval needed
Files likely affected
```

Use these approval levels:

- **automatic**: safe formatting, fixture, or ledger cleanup
- **agent-suggested**: docs, allowlists, backlog entries, lint guidance
- **human-approved**: architecture, CI gates, suppression, product vocabulary

Escalation rule:

- seen once: report only
- seen twice: recommend classification
- seen 3+ times unclassified: recommend backlog or factory improvement

## Step 3: Stop and wait

After writing `.context/factory-recommendations.md`, stop.

Tell the human:

- which recommendations are ready
- which ones need approval
- which files would change if approved

Do not edit tracked files yet.

## Step 4: Implement approved items only

After approval, make only the approved changes.

Typical approved outputs:

- docs updates in `docs/factory/`, `docs/FACTORY.md`, deployable `AGENTS.md`, or `CONTEXT.md`
- sensor or lint changes under `tools/`
- fixture tests for the changed factory behavior
- backlog entries in [`BACKLOG.md`](BACKLOG.md)
- decision records in [`decisions/`](decisions/)
- ledger updates in [`LEDGER.md`](LEDGER.md) with rationale

Then run the relevant checks:

```bash
pnpm sensor:factory-report:test
pnpm factory:test
pnpm harness:test
pnpm docs:check
pnpm format:check
```

## Step 5: Update factory memory

After approved work lands:

1. Update human ledger fields in `LEDGER.md` for accepted/backlogged/factory-improved findings.
2. Add unfinished approved work to `BACKLOG.md` with links back to ledger IDs.
3. Add a decision record for any important trade-off.

Refresh counts with:

```bash
pnpm factory:ledger --report <saved-report.md>
```

## Manual Conductor prompt

```text
Read docs/factory/SELF-IMPROVEMENT.md.
Here is the PR factory sticky comment:
<paste comment>

First, write recommendations only.
Do not edit tracked files until I approve specific items.
```

## What success looks like

The loop is working when:

- repeated findings go down
- noisy findings get accepted with reasons or get fixed in the factory
- future agents inherit clearer docs, tests, and sensors
- humans approve important trade-offs instead of re-deciding them every PR
