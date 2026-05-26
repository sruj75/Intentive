# One silent ScreenPipe crash retry before entering Capture Error state

If ScreenPipe exits unexpectedly during a Capture Session, the subprocess manager waits 2 seconds and spawns it once more. If the respawn succeeds, the Capture Session continues and the user is unaware. If it fails, Intentive enters Capture Error state.

## Context

Intentive is a background utility — the goal is that it runs invisibly and the user never has to think about it. When ScreenPipe crashes, the product response should match that philosophy: attempt to recover silently before surfacing anything to the user.

Two recovery designs were considered:

- **Design 1 — One silent retry:** crash → 2s wait → respawn once. If OK, continue. If not, Error state. Relaunch recovers.
- **Design 2 — Exponential backoff with circuit breaker:** retry with increasing delays (2s, 4s, 8s…), circuit trips after 3 failures in 5 minutes. Includes a "Restart Capture" menu action to reset without relaunch.

## Decision

Design 1 for v1. The failure modes are unknown before shipping — Design 2 is the right answer once real failure patterns from v1 users are known. One retry covers the most common transient case (memory pressure, system hiccup) with minimal complexity. Persistent failures that survive the retry are genuine bugs to triage, not runtime conditions to handle gracefully in v1.

## Considered Options

- **No retry — immediate Error state:** simple, but contradicts the "invisible and proactive" product model. Requires user to relaunch on any crash, including one-off hiccups.
- **Design 2 — persistent retry with circuit breaker:** correct long-term direction, premature before failure modes are known.

## Consequences

- The subprocess manager must distinguish Intentive-initiated exits from unexpected ones before deciding whether to retry (see ADR-0012).
- Capture Error state (yellow tray icon, disabled error info menu item) is only reached when the retry itself fails — it represents a persistent failure, not a one-off. Menu copy: **"Something went wrong — relaunch"**.
- Recovery from Capture Error state in v1 is app relaunch. The `recover_to_stopped()` FSM transition is available for future retry-loop logic but is not called by the subprocess manager in v1.
- Future slice: upgrade to Design 2 once v1 failure patterns are observed.
