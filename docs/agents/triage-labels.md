# Labels

GitHub issue labels for this repo. Skills apply these exact strings via `gh issue edit --add-label`.

## Triage roles

The skills speak in terms of five canonical triage roles:

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## Automation labels

| Label    | Meaning                                         |
| -------- | ----------------------------------------------- |
| `sentry` | Created from Sentry production issue automation |

## Deployable labels

Every backlog issue carries **exactly one** deployable label:

| Label           | Deployable      | Use when                                   |
| --------------- | --------------- | ------------------------------------------ |
| `desktop`       | Desktop client  | `apps/desktop/` work                       |
| `mobile`        | Mobile client   | `apps/mobile/` work                        |
| `agent-runtime` | Agent Runtime   | `services/agent-runtime/` work             |
| `control-plane` | Control Plane   | `services/control-plane/` work             |
| `shared`        | Shared packages | `packages/` or cross-cutting contract work |

Filter examples: `gh issue list --label agent-runtime --state open`, `gh issue list --label mobile`.

When creating an issue, add one deployable label plus any triage labels that apply.
