# Phase 6: Neon-Backed VFS, Bundles, And Memory

Status: ready-for-agent
Labels: ready-for-agent
Deployable: agent-runtime
Opened: 2026-05-28T04:17:46Z
Updated: 2026-05-28T04:17:46Z

## Description

## Parent

.scratch/v1-backlog/prds/agent-runtime-PRD.md

## What to build

Implement the Runtime's database-backed virtual document model for DeepAgents. The agent should see file-like paths, while Intentive stores immutable bundle documents and mutable user overlays in the Runtime-owned Neon schema.

## Acceptance criteria

- [ ] Runtime bundle document tables exist and can seed the first immutable bundle version.
- [ ] User overlay documents are keyed by `user_id` and absolute path.
- [ ] Reads resolve overlay-first, then pinned bundle default.
- [ ] Write/edit policy distinguishes user-writable paths from immutable bundle paths.
- [ ] The DeepAgents backend supports the required VFS operations for `ls`, `read`, `grep`, `glob`, `write`, and `edit`.
- [ ] Writes to user memory paths persist as database rows.
- [ ] Full host filesystem materialization is not introduced unless a specific backend/tool requirement is documented.

## Blocked by

- #30

## Comments
