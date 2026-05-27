# Spike assistant-ui/native Behind Intentive Chat Components

Status: open
Labels: ready-for-agent
Opened: 2026-05-22T12:14:28Z
Updated: 2026-05-22T12:14:28Z

## Description

## Parent

#1

## What to build

Spike `assistant-ui/native` as a replaceable Chat Primitive Engine behind Intentive Chat Components. Prove whether it can power assistant thread, message, composer, streaming, retry, and adapter mechanics without owning Intentive visual design or app structure.

## Acceptance criteria

- [ ] `assistant-ui/native` is installed and isolated behind local Intentive Chat Components.
- [ ] A custom user message row and assistant message row render without adopting vendor example visuals.
- [ ] A custom Composer can be wired instead of using a stock fixed footer.
- [ ] Streaming, loading, error, and retry states can be surfaced through local components.
- [ ] A custom backend/runtime adapter path is demonstrated with a dev response.
- [ ] Future nonstandard event rendering is evaluated and documented.
- [ ] The issue output states keep/eject recommendation against the ADR 0009 exit criteria.

## Blocked by

- #2

## Comments

(No comments.)
