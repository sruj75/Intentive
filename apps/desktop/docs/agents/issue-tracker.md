# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in `sruj75/v1-tauri`.
Use the `gh` CLI for issue operations from inside this clone.

## Conventions

- Create an issue with `gh issue create`.
- Read an issue with `gh issue view <number> --comments`.
- List issues with `gh issue list`.
- Comment on an issue with `gh issue comment <number>`.
- Apply or remove labels with `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close an issue with `gh issue close <number>`.

Infer the repo from `git remote -v`; `gh` does this automatically when run
inside the clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
