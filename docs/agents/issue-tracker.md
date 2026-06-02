# Issue tracker: GitHub

Issues for this monorepo live as [GitHub Issues](https://github.com/sruj75/Intentive/issues) on `sruj75/Intentive`. PRDs live at `docs/prd/<deployable>-PRD.md`. Sequenced backlog and dependencies: [`docs/ISSUE-BOARD.md`](../ISSUE-BOARD.md).

Use the `gh` CLI for all operations (run inside this repo clone).

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`
- **List issues**: `gh issue list --state open --json number,title,body,labels`
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Numbering

[`docs/ISSUE-BOARD.md`](../ISSUE-BOARD.md) and navigation use **GitHub issue numbers** (#7–#56 for the v1 backlog). PRs #1–#6 occupy GitHub numbers 1–6 and are not issues.

## Deployable labels

Each issue has a deployable code label: `DESKTOP`, `MOBILE`, `AR` (agent-runtime), `CP` (control-plane), `SHARED`.

Filter examples: `gh issue list --label AR --state open`, `gh issue list --label MOBILE`.

## PRDs

Parent scope docs: `docs/prd/<deployable>-PRD.md`

## When a skill says "publish to the issue tracker"

Create a GitHub issue with `gh issue create`. Add a deployable label (`DESKTOP`, `MOBILE`, `AR`, `CP`, `SHARED`) when appropriate.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`. The user normally passes a GitHub issue number (as in ISSUE-BOARD).

When importing or exporting, preserve issue and comment markdown content verbatim (no rewriting, summarizing, or normalization of prose).
