# Factory

Intentive's factory is the small set of guides, checks, reports, and memory that helps agents make useful changes with less review toil.

The product is not only the codebase. The product-building system is also part of what we are building: how work is specified, how agents find the right context, how changes are checked, and how repeated mistakes become better controls.

The mental model is **build the machine that builds the machine**. A good feature ships product code. A better feature also leaves the next agent with a clearer guide, sharper test, better lint message, or recorded decision.

## Systems Lens

The factory is the production system for agent-authored software. Agents write code inside the system, and the system shapes whether that work preserves long-term code quality.

In systems terms:

- **Inflow**: day-to-day coding-agent changes.
- **Outflow**: shipped code quality.
- **Stock**: the repo plus accumulated factory memory: docs, tests, lint rules, sensors, decisions, backlog, and accepted trade-offs.
- **Feedback**: Radar, usually delivered through the PR sticky comment.
- **Levers**: approved changes to guides, tests, sensors, workflows, backlog, or recorded rationale.

The sticky comment is not a random report. It is an information flow back into the production system. If it only lists problems, it is noise. If an Improvement Run turns the signal into approved changes to factory memory or controls, it changes the conditions under which future agents write code.

The quality bar is sustainable software engineering: clear ownership, tests that enable change, review discipline, maintainability, useful automation, and institutional memory. Radar should create pressure toward those values, not toward arbitrary metric-chasing.

The feedback loop only gets stronger when repeated advisory signals become durable constraints. A finding can stay advisory, but once humans approve it, the factory should capture it as a test, lint rule, guide, ownership rule, dependency policy, backlog item, or accepted rationale. The loop gain is low until feedback changes the rules of the system.

The goal is the **agentic flywheel**:

1. Humans define intent, constraints, and quality bars.
2. Agents use guides to make changes inside those constraints.
3. Gates and Radar produce feedback.
4. Humans and agents turn repeated feedback into better docs, tests, sensors, or backlog items.
5. The next agent starts from a better factory.

This is not a replacement for human judgment. It moves humans **on the loop**: steering the system that produces software instead of rediscovering the same rules in every review.

The operating model draws on:

- Donella H. Meadows's _Thinking in Systems_
- Titus Winters, Tom Manshreck, and Hyrum Wright's _Software Engineering at Google_
- Birgitta Bockeler's [Harness engineering for coding agents](https://martinfowler.com/articles/harness-engineering.html)
- Birgitta Bockeler's [Maintainability sensors for coding agents](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- Kief Morris's [Humans and Agents in Software Engineering Loops](https://martinfowler.com/articles/exploring-gen-ai/humans-and-agents.html)

## The Model

| Concept         | Purpose                                                            | Main Surface                                         |
| --------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| Gate            | Prove a change is mechanically safe enough to hand off             | `pnpm harness`                                       |
| Radar           | Point review attention at change-tied and learning findings        | `pnpm sensor:factory-report`                         |
| Memory          | Remember human decisions so repeated findings are not re-litigated | `docs/factory/LEDGER.md`, `BACKLOG.md`, `decisions/` |
| Improvement Run | Turn approved Radar findings into durable factory improvements     | `docs/factory/SELF-IMPROVEMENT.md`                   |

## Gate

The Gate is deterministic verification. It should be boring, repeatable, and strong enough to trust before handoff.

Run:

```bash
pnpm harness
```

The Gate owns typecheck, lint/docs checks, format check, architecture rules, contract drift, workspace tests, and the Mobile React Native harness. Local pre-handoff uses `pnpm harness`; CI runs the relevant root check set as path-filtered parallel `monorepo-foundation` jobs.

Gate rules:

- Keep blocking checks deterministic.
- Make failures actionable for agents.
- Put fast, high-confidence checks in the Gate.
- Keep slow or judgment-heavy checks out of the Gate unless they catch real defects reliably.

## Radar

Radar is advisory review triage. It does not block CI and it is not a score.

Run:

```bash
pnpm sensor:factory-report --base origin/main
```

Radar should be PR-delta-first. By default it shows changed-file findings, changed-workspace findings, repeated unclassified findings, returned findings, behavior coverage for changed workspaces, and compact counts for repo-wide drift.

Use the full audit view only when you are intentionally doing maintenance:

```bash
pnpm sensor:factory-report --base origin/main --audit
```

Radar rules:

- Fix findings now only when they belong to the current change.
- Backlog or accept unrelated repo-wide drift instead of drowning the PR.
- Treat repeated unclassified findings as factory bugs.
- Improve the guide, sensor, fixture, workflow, or issue template when the same review problem keeps coming back.

## Memory

Memory records human decisions about factory findings.

- `docs/factory/LEDGER.md` stores machine-readable finding state and renders a short human summary.
- `docs/factory/BACKLOG.md` stores approved future factory improvements.
- `docs/factory/decisions/` stores rationale for intentional trade-offs.

Human classifications:

- **Fixed now**: the current change removes the drift.
- **Factory improved**: the current change improves a guide, sensor, test, workflow, or review rubric.
- **Backlogged**: approved future work is recorded with enough context for another agent.
- **Accepted**: the finding is intentionally tolerated with rationale.

Memory rules:

- Do not mark findings accepted, backlogged, or factory-improved without human approval.
- Keep machine data out of the default reading path.
- Record rationale where future agents will look.

## Improvement Run

Use the Improvement Run after a non-trivial review, CI failure, or production incident exposes a factory gap.

The workflow is:

1. Generate or copy the Radar report.
2. Follow `docs/factory/SELF-IMPROVEMENT.md`.
3. Write recommendations first.
4. Wait for explicit approval.
5. Implement only approved docs, tests, sensors, workflow, backlog, or ledger changes.

When in doubt, make the smallest factory improvement that would have prevented, detected, or clarified the problem just observed.
