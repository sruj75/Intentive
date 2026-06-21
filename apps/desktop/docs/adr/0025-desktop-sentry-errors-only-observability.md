# ADR-0025: Desktop Sentry errors-only observability

Status: Accepted

## Context

The Desktop Client ships as a macOS Tauri app with two runtimes: the React webview
and the Rust backend. Before this ADR, caught webview errors rendered local UI
states only, Rust runtime failures were mostly `eprintln!`, panics were silent
after crash, and release source maps were not uploaded. The backend services
already use Sentry for errors; Desktop needed the same production visibility.

Desktop is also a screen-capture product. Observability must not weaken the
Snapshot Privacy Boundary: raw ScreenPipe output, Context Snapshot summaries,
login tokens, JWTs, cookies, request bodies, and URLs with query strings must
not enter Sentry.

## Decision

Use one Sentry project for the deployable: `hypermind-project-sh/desktop`.

Both SDKs run in errors-only mode:

- React webview initializes `@sentry/react` through `src/providers/observability.ts`.
- Rust initializes the `sentry` crate through `src-tauri/src/providers/observability/`.
- Session Replay and performance tracing are disabled in v1.
- `sendDefaultPii` / `send_default_pii` is false in both runtimes.
- `beforeSend` / `before_send` remove request bodies, cookies, query strings,
  sensitive headers, and token-like values.
- `beforeBreadcrumb` / `before_breadcrumb` scrub breadcrumb messages/data before
  they leave the process.
- Runtime breadcrumbs carry only state labels, reason codes, and lifecycle names.
  They must not include Context Snapshot summary text, raw ScreenPipe content,
  Routing URLs, login tokens, or JWTs.

The Sentry DSN is build-time configuration for distributed releases:

- Webview: `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_RELEASE`.
- Rust: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`.
- No DSN means no-op local development.

The canonical release name is `desktop@<version>`. The desktop release workflow
builds the webview with hidden source maps, injects Sentry debug IDs before Tauri
bundles `dist`, stages the injected source maps outside `dist`, removes `.map`
files before Tauri packages the app, builds/notarizes the app with the same Rust
release string, then creates/finalizes the matching Sentry release and uploads
the staged source maps.

## Consequences

- Domain code imports only the deployable-local provider seam, not SDKs directly.
- Sentry release/source-map fidelity depends on GitHub variable
  `DESKTOP_SENTRY_DSN` and secret `SENTRY_AUTH_TOKEN`.
- JavaScript events can symbolicate to original TypeScript frames after release.
- Source maps are uploaded to Sentry but are not shipped inside the notarized
  `.app` bundle.
- Rust panics and captured runtime errors land in the same Desktop project as
  webview errors, with the shared `desktop@<version>` release.
- Privacy scrubbers are now part of the Desktop Client behavior contract and
  should be extended before adding any richer breadcrumb/context data.
