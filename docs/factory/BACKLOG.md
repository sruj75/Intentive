# Factory Backlog

Approved factory improvements that are not done yet.

Each item should link back to one or more ledger IDs in [`LEDGER.md`](LEDGER.md).

| Backlog ID | Ledger ID(s)                                                                                                                                                                                      | Status  | Owner    | Summary                                                                       | Link |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- | ----------------------------------------------------------------------------- | ---- |
| FB-001     | `stale-scaffold:apps/mobile/src/domains/chat/*`, `stale-scaffold:apps/mobile/src/domains/notifications/*`, `stale-scaffold:apps/mobile/src/domains/onboarding/types/scaffold.ts`                  | planned | mobile   | Replace mobile chat/notification/onboarding scaffolds when those domains ship |      |
| FB-002     | `oversized-file:apps/desktop/src-tauri/src/domains/snapshots/runtime/heartbeat/tests.rs`, `oversized-file:apps/desktop/src-tauri/src/domains/capture/runtime/screenpipe_supervisor/tests.rs`      | planned | desktop  | Split large desktop Rust test files around named responsibilities             |      |
| FB-003     | `oversized-file:services/agent-runtime/test/ws-handler.test.mjs`, `oversized-file:services/control-plane/test/app.test.mjs`, `oversized-file:services/agent-runtime/scripts/reference-config.mjs` | planned | services | Split oversized agent-runtime and control-plane tests/scripts                 |      |
| FB-004     | `untested-export:packages/*`                                                                                                                                                                      | planned | shared   | Add focused contract tests for untested public exports in shared packages     |      |

Status values: planned, in-progress, done, dropped
