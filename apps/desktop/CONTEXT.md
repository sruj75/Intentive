# Desktop Client

The macOS Tauri application — capture-only in v1. For monorepo-wide vocabulary and the context map, read the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md). This file captures vocabulary specific to the Desktop Client.

## Language

**Desktop Client**:
The macOS application, built with Tauri, at `apps/desktop/`. **Capture-only in v1** — runs ScreenPipe, produces Context Snapshots, manages capture state from the menu bar, and exposes Account/Settings via Neon Auth UI. **No chat UI in v1.** All conversation lives on the Mobile Client (and future Android Client).
_Avoid_: Tauri app, the desktop app, OpenClaw client, desktop chat surface

**Snapshot Store**:
The Desktop Client's local SQLite record of every Context Snapshot it produced and sent. **Local-truth, not a cache** — the snapshot originates on-device and the local copy is the audit trail. Different role from chat history; do not generalize the two.
_Avoid_: cache, mirror of server state, optional store

**Capture Permission Setup**:
The macOS Privacy Settings flow (Screen Recording, Microphone, Accessibility) required on the Mac before the Desktop Client can start a Capture Session. **Device-Local Gate**. Cannot be granted from the phone. The flow's all-three-grants completion is enforced **locally** on the Mac (see **Desktop Capture Readiness**); the Control Plane gate of the same name (`capture_permission_setup` in the Pre-Chat Gate sequence) is a coarser policy nudge that sees only the live Screen-Recording signal (ADR-0020). The flow opens with one plain-language "what Intentive captures on this Mac, and why" acknowledgment screen — **this is the explicit desktop-capture consent ADR-0009 requires** (Mac-local, not borrowed from the phone's shared **Consent Primer**); the per-permission macOS grant dialogs supply per-permission consent. There is no separate consent gate beyond these. The UI is a **sequential, one-permission-at-a-time "Opal-style" wizard** (curated static instructional screenshot + deep-link + live recheck per step, with ~1.5s UI polling between steps), **not** a flat checklist; the intro consent acknowledgment is remembered across re-entry, and on "Finish Setup…" the flow resumes at the **first ungranted** permission. The wizard is a _view_ over the ScreenPipe-adapted detection engine (ADR-0021) — Opal-style UX, ScreenPipe-style detection.

**Desktop Capture Readiness**:
The Desktop Client's **local, live** judgement that all three required macOS grants (Screen & System Audio Recording, Microphone, Accessibility) are present right now. The **interlock authority**: the Rust core will not start ScreenPipe or the Context Heartbeat unless this is true, regardless of the Control Plane gate. Read live from the OS each check (the user can revoke in System Settings anytime); never stored as durable truth. The Control Plane is the _policy_ authority ("may this Mac auto-start"); Desktop Capture Readiness is the _interlock_ authority ("are the grants physically present"). See ADR-0009, ADR-0020. When a signed-in user is not capture-ready, the Capture Session shell sits in a distinct **`SetupRequired`** state (signed in, idle, Desktop Capture Readiness false) — surfaced in the menu bar as **"Finish Setup…"** — separate from `Stopped` (user paused; readiness revoke/restore does not auto-resume or overwrite this), `Unauthenticated` (not signed in), and `Error` (capture failure; if a crash was permission-caused, the readiness monitor poll corrects it to `SetupRequired` per ADR-0021).
_Avoid_: capture-ready flag, permission cache, server-confirmed readiness

**Routing State**:
Whether the Desktop Client currently holds usable **Routing** (the `ws_url` + `runtime_jwt` + `agent_instance_id` issued by the Control Plane's `GET /agent`). One of `signed_out`, `signed_in` (have a login token, no Routing yet), `routing_ready`, `routing_error`. Owned and held in process memory by the Rust core; never surfaced in Settings. Answers "do we have credentials to connect?" — **not** "is the connection up?".
_Avoid_: connection state, socket state, online/offline

**Session State**:
Whether the Protocol WebSocket to the **Agent Runtime** is connected **right now**. One of `disconnected`, `connecting`, `connected`, `reconnecting`. A dropped line moves only this state; it does not invalidate **Routing State**. The Rust core emits Protocol events only when Routing State is `routing_ready` **and** Session State is `connected`.
_Avoid_: routing state, auth state, login state

## Relationships

- The webview owns **sign-in** and re-syncs the login token to the Rust core when it changes (unchanged token is a no-op); the Rust core owns **Routing** end-to-end — it calls `GET /agent`, holds Routing in memory, and re-fetches it when the runtime rejects the badge.
- **Routing State** and **Session State** are independent. A WebSocket drop moves only Session State (`connected → reconnecting`); Routing State changes only when Routing is fetched, refreshed, or rejected (`auth_failed`).
- A snapshot is emitted only when **Routing State** is `routing_ready` **and** **Session State** is `connected`. Otherwise it stays in the **Snapshot Store** with `pushed_at = null`.
- **Capture** is gated by sign-in + **Desktop Capture Readiness**, not by Routing/Session State. A down connection never stops capture (at-most-once, local-truth).

## Flagged ambiguities

- "signed in" was used to mean both "has a login token" and "ready to emit snapshots" — resolved: these are distinct. **Routing State** answers "do we have credentials?"; **Session State** answers "is the line up?". Being signed in implies neither.
- "capture-ready" / "Desktop Capture Readiness" was used to mean both the Control Plane's gate decision and the Mac's local grant check — resolved: the Control Plane is the _policy_ authority (sees Screen-Recording only), the Mac's local three-grant check (**Desktop Capture Readiness**) is the _interlock_ authority that physically blocks capture. They can legitimately disagree (ADR-0020).
