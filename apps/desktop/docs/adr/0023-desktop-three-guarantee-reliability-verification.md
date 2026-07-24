# Verify Desktop reliability and privacy as three guarantees, not eight checkboxes

The Desktop reliability/privacy verification work (#43) is structured as **three deep guarantees** — local invariants, cross-language contract conformance, and privacy efficacy — each with its own failure-shape, owner, and cadence. It is **not** a flat list of test checkboxes, and it does **not** add any delivery-side acknowledgement or retry.

## Context

#43 ("Add v1 reliability and privacy verification harness") was written as eight `Verify X` acceptance criteria. By the time #43 was scoped, the code already satisfied most of them: the Context Heartbeat, Snapshot Store, and summarization modules carry Rust unit tests for write-before-emit ordering, null `pushed_at` on a down socket, 7-day retention purge, heartbeat survival after a failed emit, the privacy-prompt wiring, and model-free summarization fakes. #34 also shipped `apps/desktop/src/protocol-contract.test.ts` — the Rust golden fixtures (`src-tauri/fixtures/*.json`) parsed through the real `parseClientToRuntimeEvent()` from `@intentive/protocol`.

Two criteria did **not** survive contact with the code:

- **Criterion 4 lists failure modes the client cannot observe.** ADR-0005 makes emit fire-and-forget with no Runtime→Client ack for `context_snapshot`. In code, `WsSession::try_emit` has exactly one error — `NotConnected` — and `pushed_at` is stamped on socket-write (`heartbeat`: `if sink.emit(...).is_ok() { mark_pushed() }`). "Timeout" and "protocol/gateway rejection" produce **zero** signal on the Mac; the row is already marked delivered. They are silent **by design**.
- **Criterion 1 over-promises.** A model-free test can only assert the redaction _instruction is in the prompt_ (`summarize_prompt_includes_privacy_constraints`), not that the model _obeys_ it. Asserting prompt-wiring and calling it "verified privacy" manufactures false confidence about secrets leaving the Mac.

The flat-checkbox framing hid that these eight assertions protect against three structurally different failures that run on three different clocks.

## Decision

Treat #43 as an **audit-and-prove** slice over three guarantees:

- **A — Local invariants** (Rust unit tests, every commit): ordering, null `pushed_at`, 7-day purge, heartbeat-survives-failed-emit, no-raw-ScreenPipe (structural — the `ContextSnapshot` struct has no raw field), model-free summarization. These already largely exist; #43 audits that each is pinned and fills any gap rather than rewriting them.
- **B — Cross-language contract conformance** (`protocol-contract.test.ts`, every commit): the Rust serializer output validates against the live Zod boundary parser. This is the **compensating control** for B-class silent loss: because a drifted frame is dropped silently at runtime with no ack, the only defence is to make a drifted frame **impossible to ship** — caught in CI, not at runtime.
- **C — Privacy efficacy** (adversarial eval, out-of-band): whether the model actually omits credentials/financial/PII. Model-free CI asserts only (i) prompt-wiring and (ii) the structural Snapshot Privacy Boundary. Real redaction efficacy is an **eval** — a **Rust `#[ignore]`d integration test** (`summarization/service/eval.rs`) driving the _real_ `LlmProvider::summarize()`, so it exercises the actual privacy prompt rather than a copy. **v1 detection is a deterministic planted-token match**: adversarial fixtures with planted passwords/cards/SSNs/keys are summarized, then the suite asserts the planted tokens (and obvious normalized forms) are absent and reports the single-pass leak rate. It needs a real local model, so it runs out-of-band via `pnpm eval:privacy`, not per-commit (consistent with criterion 8). **An LLM-as-judge** (catching semantic/paraphrase leaks the token match misses) is the documented **next layer**, naturally co-arriving with the deferred runtime guardrail. #43 builds the deterministic eval; it never pretends a model-free test covers efficacy. Runbook: `apps/desktop/docs/EVAL.md`.

A **runtime privacy guardrail** — judge each live summary against a checklist and regenerate (hard cap ≤5) before emit — was considered and **deferred as a separate, evidence-gated summarization-domain feature**, not part of #43. Rationale: (1) it is production behavior, not verification, so it does not belong in a verification slice; (2) the eval (C) must run first to measure whether the single-pass prompt even leaks — build the feedback loop before the mechanism; (3) a **same-model self-judge inherits the generator's blind spots** — it catches careless inclusion, not failures of recognition (a secret the summarizer never recognized, the judge won't either), and on the weakest LLM Provider tier (Apple Intelligence on-device) that blind spot is largest — so it is a mitigation, not a guarantee. Latency is not an objection (10-minute cadence). If built, a max-retry exhaustion must fail safe (drop or emit a "details withheld" placeholder — never emit the flagged summary).

**Criterion 4 is narrowed** to the one client-observable failure (socket down → `pushed_at` null, next heartbeat unaffected). Timeout and gateway-rejection get **no client test**; guarantee B is recorded as their compensating control.

**No delivery redesign.** At-most-once, no-ack, no retry, no dead-letter (ADR-0005) stays. Adding acknowledgement to make B-class failures observable at runtime is deliberately out of v1 scope.

## Considered Options

- **Implement the eight criteria literally.** Rejected: ~6 are already covered, and criterion 4 asks for client tests of unobservable failures — the tests would be fakes that assert nothing real.
- **Add a Runtime→Client ack (or DLQ/retry) so silent loss becomes observable.** Rejected for v1: reverses ADR-0005 and adds real complexity for a consciously-deferred problem.
- **Generate the Rust frame types from the shared schema so drift is impossible at the source.** Rejected for v1: heavy for two event types; the fixture round-trip (B) is the right-sized guard. Revisit if desktop→runtime event kinds proliferate.

## Consequences

- The #43 deliverable is a single discoverable verification map (criterion → guarantee → the test that proves it) plus the one or two genuine gap-fills, not a new pile of tests.
- Guarantee B is load-bearing and must stay airtight: the committed fixtures must be provably reproduced by the live Rust serializer, or B silently rots into a stale photograph.
- Privacy efficacy (C) ships as a deterministic planted-token eval in #43 (Rust `#[ignore]`d test + `pnpm eval:privacy` + EVAL.md), run out-of-band on a real model. The LLM-as-judge layer (semantic leaks) stays deferred, co-arriving with the runtime guardrail.
- Note a stale doc to reconcile: PRD user-story 28 says "next heartbeat may retry undelivered rows," but ADR-0005 and the code emit only each tick's freshly-produced snapshot — null rows are never re-sent. The guarantee-A test must pin the ADR-0005 behavior (no retry), and the PRD line should be corrected.
