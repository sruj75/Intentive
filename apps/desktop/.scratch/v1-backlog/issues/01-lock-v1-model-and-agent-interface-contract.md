# Lock v1 model and Agent Interface contract

Status: closed
Labels: enhancement, ready-for-human
Opened: 2026-05-18T10:31:44Z
Updated: 2026-05-19T09:29:17Z
Closed: 2026-05-19T09:29:17Z

## Description

## Parent

#1

## What to build

Resolve the two implementation decisions that other v1 slices depend on: the final local Ollama model tag and the exact Agent Interface contract expected by the OpenClaw Agent. This issue should produce a clear decision that implementation agents can follow without re-litigating model choice, request headers, or timeout behavior.

## Acceptance criteria

- [ ] The final local model tag for Intentive first-run setup is selected and recorded.
- [ ] The existing model-name inconsistency between the specification and ADR text is resolved in the relevant docs.
- [ ] The OpenClaw Agent endpoint contract is confirmed, including required headers, JSON payload fields, and timeout threshold.
- [ ] The decision preserves the v1 rule that raw ScreenPipe data is never sent through the Agent Interface.

## Blocked by

None - can start immediately


## Comments

### 01 @sruj75 — 2026-05-19T09:29:16Z

Closing — acceptance criteria met.

**Model tag**
- Tier 3 bundled model locked to `qwen3.5:0.8b` (SPEC.md Resolved, ADR-0006, `llm_provider/bundled.rs`).
- Tier 2 rule: loaded model → first installed model ≤ 5GB on disk → fall through to Tier 3.

**Doc consistency**
- SPEC.md and ADR-0006 aligned on `qwen3.5:0.8b` and the 5GB Tier 2 threshold (replacing earlier `llama3.2:1b` prose).

**Agent Interface contract**
- `src-tauri/src/agent_interface/`: 5-field JSON payload (`id`, `captured_at`, `period_start`, `period_end`, `summary`), `Authorization: Bearer`, 10s timeout, drop-on-failure (ADR-0005). Wiremock tests cover the contract.

**Privacy**
- Only sanitized summary + metadata crosses the Agent Interface; raw ScreenPipe data stays on-device.

CHANGELOG [Unreleased] documents the lock. Downstream slices can depend on this contract without re-litigating.
