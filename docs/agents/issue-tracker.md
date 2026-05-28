# Issue tracker: Local Markdown (Single root tracker)

Issues and PRDs for this monorepo live as markdown files under a single root tracker at `.scratch/v1-backlog/`.

## Tracker root

`.scratch/v1-backlog/` — one unified backlog for all deployables and shared packages.

- PRDs: `.scratch/v1-backlog/prds/<deployable>-PRD.md`
- Issues: `.scratch/v1-backlog/issues/NN-<CODE>-<slug>.md`, numbered `01`–`50` globally in MISSION-CONTROL.md execution order

## Filename convention

```
NN-<CODE>-<slug>.md
```

- `NN` — two-digit global sequence number (01–50), ordered by MISSION-CONTROL.md phase
- `CODE` — deployable identity prefix: `DESKTOP`, `MOBILE`, `AR` (agent-runtime), `CP` (control-plane), `SHARED`
- `slug` — kebab-case short description matching the issue title

## Canonical Issue Format

Use this exact local markdown format for issue files:

```md
# <Issue title>

Status: <open|closed|needs-triage|needs-info|ready-for-agent|ready-for-human|wontfix>
Labels: <comma-separated labels or (none)>
Deployable: <desktop|mobile|agent-runtime|control-plane|shared>
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

## Cross-references

- In `## Blocked by`, `## Unblocks`, and `## Parent`, reference issues by global ID (e.g. `#08`, `#24`).
- Preserve prose `#N` mentions verbatim — do not rewrite historical narrative.
- `## Parent` points to the PRD file path relative to the repo root: `.scratch/v1-backlog/prds/<deployable>-PRD.md`.

## When a skill says "publish to the issue tracker"

Create a new file in `.scratch/v1-backlog/issues/` with the next available `NN` global number, following the `NN-<CODE>-<slug>.md` naming convention. Update MISSION-CONTROL.md to sequence the new issue.

## When a skill says "fetch the relevant ticket"

Read the file at `.scratch/v1-backlog/issues/NN-<CODE>-<slug>.md`. The user will normally pass a global number or a filename.
