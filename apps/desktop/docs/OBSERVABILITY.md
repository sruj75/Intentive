# Desktop Sentry observability

How the Desktop Client uses Sentry for production error visibility — what it
reports, what it deliberately excludes, and how to work with it.

The decision record is [ADR-0025](adr/0025-desktop-sentry-errors-only-observability.md).
Release setup and source-map upload steps are in [RELEASE.md](RELEASE.md).

## Why Sentry exists here

The Desktop Client is a Tauri app with two runtimes: a React webview and a Rust
backend. Before Sentry, webview errors mostly showed up as local UI states, Rust
failures went to `eprintln!`, and panics disappeared after crash. Backend services
already had Sentry; Desktop needed the same kind of production signal.

Sentry is **errors-only** in v1. It answers: _what broke in the field, in which
release, with what stack trace?_ It does not answer performance questions, session
replay, or user-behavior analytics.

## One project, one release

All Desktop events land in a single Sentry project:

**`hypermind-project-sh/desktop`**

Webview and Rust share the same release name: **`desktop@<version>`** (for example
`desktop@0.1.0`). That lets you correlate a React error with a Rust panic from the
same shipped build.

| Runtime | SDK             | What it captures                                                                             |
| ------- | --------------- | -------------------------------------------------------------------------------------------- |
| Webview | `@sentry/react` | Uncaught/render errors, unhandled promise rejections, caught exceptions we explicitly report |
| Rust    | `sentry` crate  | Panics, captured runtime errors, explicit messages                                           |

Session Replay and performance tracing are **disabled**. `sendDefaultPii` /
`send_default_pii` is **false** in both runtimes.

## What gets reported

### Errors (the main signal)

Sentry receives events when something genuinely failed:

- **Webview** — React render crashes (ErrorBoundary), unhandled promise rejections,
  and caught failures in auth sync, onboarding, and permission setup.
- **Rust** — panics; capture/routing/heartbeat/summarization failures such as
  ScreenPipe supervisor start/stop errors, Control Plane fetch failures, WebSocket
  transport errors, activity-query failures, summarization failures, snapshot store
  errors, and unexpected push/emit failures.

Each error includes a stack trace. Webview stacks symbolicate to TypeScript when
source maps were uploaded for that release (see below).

### Breadcrumbs (context, not the story)

Breadcrumbs are a lightweight timeline attached to an error — they help you see
_what the app was doing_ before it broke. They are **not** a log stream on their
own; they only appear alongside an error event.

Examples of what breadcrumbs carry:

- Capture FSM state transitions (`stopped` → `capturing`)
- Routing/session state changes and runtime handshake outcomes
- Heartbeat ticks, LLM-unresolved skips, session-end marker emission
- LLM provider tier resolution

Breadcrumbs use **labels only** — state names, reason codes, frame type names.
They never carry user content.

### What is intentionally _not_ reported

Some conditions are expected and stay out of Sentry:

- **Agent Runtime not connected** — snapshot push and session-end marker emit
  failures with `NotConnected` are normal when the WebSocket is down. Only
  unexpected push/emit failures (network, serialization, etc.) become Sentry
  errors.

Everything else that looks like a routine lifecycle event (heartbeat ticking,
routing reconnecting) stays as breadcrumbs or local `eprintln!` output, not as
standalone Sentry events.

## Privacy: the Snapshot Privacy Boundary

Desktop captures the user's screen. Observability must not weaken the privacy
guarantees of the product itself. **Nothing sensitive leaves the process**, even
before it reaches Sentry's servers.

Both runtimes scrub events and breadcrumbs in `beforeSend` / `before_send` and
`beforeBreadcrumb` / `before_breadcrumb`:

| Never sent to Sentry                                   | Why                                     |
| ------------------------------------------------------ | --------------------------------------- |
| Context Snapshot summary text                          | User activity distilled from ScreenPipe |
| Raw ScreenPipe content                                 | Direct capture output                   |
| Login tokens, JWTs, cookies                            | Auth credentials                        |
| Request bodies and query strings                       | May contain secrets or PII              |
| Routing URLs with query params                         | May embed tokens                        |
| Keys like `token`, `snapshot`, `summary`, `screenpipe` | Catch-all for sensitive payloads        |

Scrubbers replace matched values with `[Filtered]`. This is a **behavior contract**
of the Desktop Client — extend scrubbers before adding richer context to any event.

Local structured logging (`eprintln!` in Rust) still exists for dev diagnostics.
Sentry complements it for production; it does not replace local logs.

## Local development vs production

**No DSN → no-op.** When Sentry env vars are unset, both SDKs initialize as
no-ops. Local `tauri dev` runs do not send events unless you opt in.

To test locally, copy [`.env.example`](../.env.example) to `.env` and set:

```bash
VITE_SENTRY_DSN=<dsn>
VITE_SENTRY_ENVIRONMENT=development
VITE_SENTRY_RELEASE=desktop@local
SENTRY_DSN=<dsn>
SENTRY_ENVIRONMENT=development
SENTRY_RELEASE=desktop@local
```

Production builds get DSN, environment (`production`), and release
(`desktop@<version>`) from the [`desktop-release`](../../.github/workflows/desktop-release.yml)
workflow via GitHub variable `DESKTOP_SENTRY_DSN`.

## Source maps and stack traces

The webview builds with **hidden** source maps. On release:

1. Maps are generated and Sentry debug IDs are injected.
2. Maps are **removed** from the notarized `.app` bundle (users never receive them).
3. Maps are uploaded to Sentry under the matching `desktop@<version>` release.

Rust stack traces come from debug symbols in the build; webview stacks need the
uploaded maps to point at TypeScript source instead of bundled JS.

`verify-release-artifacts.sh` fails if any `.map` file ships inside `Intentive.app`.

## Reading events in Sentry

When triaging a Desktop issue:

1. **Filter by release** — `desktop@<version>` matches the user's installed build
   (also visible in the Tauri updater / GitHub Release tag).
2. **Check runtime** — webview events come from JavaScript; Rust events from the
   native backend. Both may appear for the same user session if both sides fail.
3. **Read breadcrumbs** — look at `desktop.capture`, `desktop.routing`,
   `desktop.heartbeat`, and `desktop.summarization` categories for the timeline
   before the error.
4. **Verify scrubbing** — if you see `[Filtered]` in a message, the scrubber did
   its job. If you ever see raw snapshot text or tokens, that is a privacy bug.

## Where the code lives

Implementation is behind deployable-local provider seams (not direct SDK imports in
domain code):

- Webview: `src/providers/observability.ts`
- Rust: `src-tauri/src/providers/observability/`

See [ARCHITECTURE.md](../ARCHITECTURE.md) for how these fit the module map.
