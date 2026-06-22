# Observability (Mobile Client)

How the Intentive Mobile Client uses Sentry — what it is for, what it reports,
what it deliberately does not collect, and how to read events when something
breaks in the field.

## Purpose

The Mobile Client uses Sentry as an **errors-only** signal. The goal is to
learn when the app fails in ways users cannot recover from on their own — auth
breaks, runtime connection failures, unhandled crashes — without turning the
companion chat into a telemetry surface.

Sentry is **not** product analytics, session replay, or performance monitoring
for this app. It answers: _did the client fail, where in the stack did it fail,
and in which build/environment?_

## What gets reported

| Source                 | When                                                                                       | Typical tags                                                |
| ---------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **Root crash handler** | Unhandled JS/native errors bubble to the app root                                          | (Sentry default grouping)                                   |
| **Auth Adapter**       | Sign-in returns an error, sign-in throws, or JWT read throws                               | `error_type: auth`, `auth_provider: google \| apple \| dev` |
| **Runtime Adapter**    | Terminal connection/protocol/routing failure (socket closed, bad frame, routing exhausted) | `error_type: protocol`, `error_type: routing`, …            |

Runtime Adapter failures also leave a **breadcrumb** immediately before the
exception — a short note that the adapter entered an error state, with the
error kind in `data`. Breadcrumbs are context for debugging, not a user-facing
log.

Recoverable UI states (e.g. "Connection issue" shown in **Companion Chat**,
retryable send failures, gate screens showing `not-configured`) are **not**
automatically reported unless they escalate to one of the capture points above.

## What does not get reported

These are explicitly **not** configured:

- Message text, **Conversation History**, or companion replies
- User identifiers, email, or JWT contents
- Performance traces, screen timings, or network spans
- Session replay or screen recordings
- Profiling
- Push notification payloads
- Routine navigation or gate progression

The **Telemetry** port only exposes `captureException` and `addBreadcrumb`.
Domains never send free-form user content through it.

## Privacy and data minimization

Observability on mobile follows the same boundary as the rest of the app:
**Conversation History is server-truth** — the client does not persist or export
transcripts for debugging.

What may appear on an event:

- Error message and stack trace (standard Sentry)
- Structured tags (`error_type`, `auth_provider`, runtime error kind)
- Breadcrumb metadata (e.g. `{ error_type: "protocol" }`)
- Sentry environment (`development` vs `production`) and release/build metadata
  from the native SDK

What should **not** appear:

- Chat bodies, opening messages, or composer drafts
- Access tokens or **User JWT**s
- Control Plane account payloads

If sensitive data ever shows up in an event, treat it as a bug in the capture
path and fix the tag/breadcrumb payload — not a reason to expand collection.

## Environments

| Context                                      | Sentry active?                          | `environment` tag |
| -------------------------------------------- | --------------------------------------- | ----------------- |
| Local dev (blank DSN)                        | No — telemetry is fully disabled        | —                 |
| Local dev (DSN set, e.g. via `eas env:pull`) | Yes                                     | `development`     |
| EAS **preview** builds (TestFlight-style)    | Yes, when DSN is set on the environment | `production`\*    |
| EAS **production** builds (App Store)        | Yes, when DSN is set on the environment | `production`      |

\*Release builds always tag `production` in Sentry today; filter by release
channel or build metadata in the Sentry UI if you need to separate preview
from App Store.

**Local default:** leave `EXPO_PUBLIC_SENTRY_DSN` blank in `.env` so day-to-day
development does not noise the project.

**Shipped builds:** the public DSN is baked in at EAS Build time per
environment (`preview`, `production`). OTA updates inherit the DSN from the
binary they run on — changing the DSN requires a new build, not just an update.

Sentry project: **mobile** (org `heyintentive`). Setup details:
[RELEASE.md](./RELEASE.md).

## Mental model

```
User action
    │
    ├─ Identity Gate ──► Auth Adapter ──► capture on hard auth failure
    │
    └─ Companion Chat ──► Runtime Adapter ──► capture on terminal runtime failure
                              │
                              └─ UI may show "connection issue" without Sentry
                                 unless the adapter hits a terminal error path

Unhandled throw anywhere ──► root crash handler ──► Sentry (when DSN set)
```

**Auth failures** mean the client could not establish or read credentials —
not "user cancelled Google sign-in" (that is a normal outcome, not captured).

**Runtime failures** mean the Protocol WebSocket path hit a non-recoverable
error state — not every reconnect or transient blip. The adapter owns the line
between "show reconnecting in UI" and "report terminal failure."

## Reading events in Sentry

When triaging a mobile issue:

1. **Filter by `environment`** — ignore `development` unless you are debugging
   a deliberate local repro.
2. **Check `error_type`** — `auth` vs `protocol` vs `routing` tells you which
   deep module failed without reading Mobile Client source.
3. **For auth**, use **`auth_provider`** — separates Neon Google/Apple from
   dev-only paths.
4. **Open breadcrumbs** on runtime issues — confirms the adapter transitioned
   to error state before the exception.
5. **Match release/build** to the EAS channel (preview vs production) using
   Sentry's release field, not chat content.

Common questions:

- _"User couldn't send a message"_ — look for `error_type: protocol` or
  routing tags; a failed send with retry still in UI may not have fired.
- _"Sign-in looked broken"_ — look for `error_type: auth`; cancelled flows
  usually won't appear.
- _"App crashed on launch"_ — unhandled exception at root; check recent binary
  version and whether Sentry native plugin is in that build.

## Relationship to the rest of Intentive

| Surface                           | Observability                                               |
| --------------------------------- | ----------------------------------------------------------- |
| **Mobile Client** (this app)      | Sentry, errors-only, via `Telemetry` port                   |
| **Control Plane / Agent Runtime** | Separate server-side observability in `packages/providers/` |

Mobile Sentry does **not** substitute for server logs or Langfuse traces on
the Agent Runtime. A chat that "feels wrong" but did not crash the client may
only be visible server-side.

## Code boundary (for contributors)

Implementation lives in `src/providers/telemetry/`. Domains depend on the
`Telemetry` interface — they do not import `@sentry/react-native` directly.
That keeps observability a replaceable cross-cutting concern rather than a
domain dependency.

For vocabulary, see **Telemetry** in [CONTEXT.md](../CONTEXT.md). For release
and env-var commands, see [RELEASE.md](./RELEASE.md).
