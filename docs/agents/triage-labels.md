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

## Deployable codes

Every backlog issue carries **exactly one** deployable code label:

| Label | Deployable | Use when |
| ----- | ---------- | -------- |
| `DESKTOP` | Desktop client | `apps/desktop/` work |
| `MOBILE` | Mobile client | `apps/mobile/` work |
| `AR` | Agent Runtime | `services/agent-runtime/` work |
| `CP` | Control Plane | `services/control-plane/` work |
| `SHARED` | Shared packages | `packages/` or cross-cutting contract work |

Filter examples: `gh issue list --label AR --state open`, `gh issue list --label MOBILE`.

When creating an issue, add one deployable label plus any triage labels that apply.
