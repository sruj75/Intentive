# Subprocess manager tracks shutdown intent to distinguish controlled stop from crash

The ScreenPipe subprocess manager holds an atomic boolean that is set to `true` before sending a kill signal. The process-exit watcher checks this flag to determine whether an exit is expected (controlled stop → `Stopped` state) or unexpected (crash → `Capture Error` state).

## Context

When the ScreenPipe child process exits, the subprocess manager must decide which FSM transition to fire: `Stopped` (normal) or `Error` (crash). The obvious approach is to inspect the exit code or signal. This is unreliable — process exit codes are not a stable API and ScreenPipe may exit 0 on some crash paths or non-zero under SIGTERM.

## Decision

Track intent explicitly. Before calling kill/SIGTERM on the child, set a `shutdown_intended: AtomicBool` flag to `true`. In the exit-watcher callback, read the flag: if `true`, the exit was expected; if `false`, it was not. Reset the flag after reading.

This is the minimum bookkeeping needed to avoid falsely entering Capture Error state on a normal user-initiated stop.

## Consequences

- The subprocess manager must set the flag before any intentional kill: user toggle, app quit, and any future controlled teardown path.
- Forgetting to set the flag before a kill will cause a spurious Capture Error on stop — the flag is a correctness invariant, not an optimisation.
- Exit code inspection is not used for state routing in v1; structured exit-code handling is a future concern if ScreenPipe formalises its exit codes.
