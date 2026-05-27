# Issue tracker: Local Markdown (Monorepo, independent per deployable)

Issues and PRDs for this monorepo live as markdown files, with a separate tracker per deployable instead of one shared root tracker.

## Tracker roots

- Mobile Client: `apps/mobile/.scratch/`
- Desktop Client: `apps/desktop/.scratch/`
- Control Plane: `services/control-plane/.scratch/`
- Agent Runtime: `services/agent-runtime/.scratch/`
- Cross-cutting monorepo work (protocol/contracts/shared packages): `.scratch/shared/`

## Conventions (applies inside each tracker root)

- One feature per directory: `<tracker-root>/<feature-slug>/`
- The PRD is `<tracker-root>/<feature-slug>/PRD.md`
- Implementation issues are `<tracker-root>/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Canonical Issue Format (GitHub-shaped)

Use this exact local markdown format for issue files:

```md
# <Issue title>

Status: <open|closed|needs-triage|needs-info|ready-for-agent|ready-for-human|wontfix>
Labels: <comma-separated labels or (none)>
Opened: <ISO timestamp>
Updated: <ISO timestamp>
Closed: <ISO timestamp>   <!-- include only when closed -->

## Description

<issue body markdown>

## Comments

### 01 @<author> — <ISO timestamp>

<comment body markdown>
```

### Mapping from GitHub

- GitHub `title` -> markdown `# <Issue title>`
- GitHub `state` -> `Status: open|closed`
- GitHub `labels[].name` -> `Labels: ...`
- GitHub `createdAt` -> `Opened: ...`
- GitHub `updatedAt` -> `Updated: ...`
- GitHub `closedAt` -> `Closed: ...` (only when present)
- GitHub `body` -> `## Description`
- GitHub `comments[]` -> `## Comments` entries in chronological order, numbered `01`, `02`, ...

When importing, preserve issue and comment markdown content verbatim (no rewriting, summarizing, or normalization of prose).

## How to choose the tracker

- If work is scoped to one deployable, write/read issues in that deployable's tracker root.
- If work spans multiple deployables or shared packages, write/read issues in `.scratch/shared/`.

## When a skill says "publish to the issue tracker"

Create a new file in the correct tracker root for that scope (create missing folders as needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass a full path or an issue filename.
