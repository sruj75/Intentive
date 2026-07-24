# Rust core owns Routing and the Protocol WebSocket session

Status: accepted

The Rust core — not the webview — owns **Routing** end-to-end. The webview owns sign-in (Neon Auth) and re-syncs the login token to Rust when it changes (mount, focus, interval); an unchanged token is a no-op on both sides so a live session is not torn down. Rust then calls the Control Plane's `GET /agent`, holds the resolved Routing (`ws_url`, `runtime_jwt`, `agent_instance_id`) in process memory, opens the long-lived Protocol WebSocket to the Agent Runtime, and re-fetches Routing itself when the badge is rejected. The `runtime_jwt` never enters the webview. This is the ownership decision behind Issue #31; it replaces the legacy one-shot HTTP delivery in `snapshots::runtime::agent_interface` with a real WebSocket session (connect + reconnect + error). Framed `context_snapshot` / `session_end_marker` emission through that session is #34.

## Considered options

- **Webview owns Routing, hands values to Rust.** Rejected: the `runtime_jwt` is short-lived, so on expiry Rust would have to call back up into UI code that may be closed or asleep to get a fresh badge. Reconnect-and-refresh becomes a cross-bridge dance that depends on the visible window being alive, and the JWT travels through the UI layer (against `ARCHITECTURE.md` invariants #2 and #12).
- **Rust owns Routing end-to-end (chosen).** The webview's only job is to pass down the login token. Rust owns the fetch, the cached Routing, the socket, and the refresh loop. The reconnect/refresh logic is self-contained in one place, and the JWT stays out of the UI entirely.

## Consequences

- The Rust core gains a small authenticated `GET /agent` HTTP call (it already depends on `reqwest`).
- Connection state is modeled as two independent dials — **Routing State** and **Session State** (see `CONTEXT.md`) — because "do we hold a valid badge?" and "is the line up right now?" come apart constantly.
- Reconnect rule lives entirely in Rust: exponential backoff **with jitter**, reconnect indefinitely, never block capture. Re-fetch Routing **only** on a `runtime_error` of `auth_failed`; wait-and-retry the same badge on `service_unavailable`; **stop** (enter `routing_error`, do not loop) on `protocol_unsupported`/`invalid_connect`.
- Capture is unaffected by connection health: a down line leaves snapshots in the Snapshot Store with `pushed_at = null` (at-most-once, local-truth), so the reconnect loop can stay silent and infinite with no user-facing "you're offline" state.
- #34 implements live Protocol emission through the session via the composition-root `WsSessionAgentSink` bridge; delivery success stamps `pushed_at` on socket-write acceptance (ADR-0005).
