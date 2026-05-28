# Phase 5: DeepAgents Integration

Status: ready-for-agent
Labels: ready-for-agent
Opened: 2026-05-28T04:17:46Z
Updated: 2026-05-28T04:17:46Z

## Description

## Parent

services/agent-runtime/.scratch/agent-runtime-v1/PRD.md

## What to build

Replace the fake or stubbed Companion turn with a narrow DeepAgents integration. The Runtime shell should invoke DeepAgents for an ordered event turn while keeping the shell testable through a fake adapter.

## Acceptance criteria

- [ ] Agent Runtime dependencies include the chosen DeepAgents, LangChain, LangGraph, and model-provider packages.
- [ ] A Runtime service builds or invokes a DeepAgents instance for one ordered event turn.
- [ ] The first minimal product tools are registered through DeepAgents rather than a parallel shell tool loop.
- [ ] DeepAgents invocation receives `user_id`, Agent Instance, bundle version, and VFS backend context.
- [ ] Runtime turns capture trace or run identifiers for observability.
- [ ] A `user_message` can produce a persisted `companion_message` through DeepAgents.
- [ ] Shell behavior tests can fake DeepAgents deterministically.

## Blocked by

- 05-conversation-history-and-reconnect-snapshot.md

## Comments
