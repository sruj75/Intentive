# Push Context Snapshots through Auth-resolved Agent Interface config

Status: open
Labels: enhancement, ready-for-agent
Opened: 2026-05-18T10:33:54Z
Updated: 2026-05-20T11:11:25Z

## Description

## Parent

#1

## What to build

Push Context Snapshots to the user's OpenClaw Agent through the Agent Interface using Auth-resolved configuration from #13.

This replaces the legacy manual endpoint/API-key path. Intentive still needs an endpoint and authorization credential internally, but users do not enter or edit those values in Settings. The push layer should consume the resolved Agent Interface configuration supplied by Auth state and fail safely when that configuration is missing or invalid.

## Acceptance criteria

- [ ] Intentive obtains Agent Interface endpoint and credential/token details from the Auth-resolved configuration defined by #13.
- [ ] Intentive does not read endpoint URL or API key values from user-visible Settings fields.
- [ ] Intentive POSTs Context Snapshot JSON to the resolved OpenClaw Agent endpoint.
- [ ] The JSON payload includes id, captured_at, period_start, period_end, and summary.
- [ ] The request includes the Authorization header or equivalent credential mechanism confirmed by #2/#13.
- [ ] Missing or invalid Auth-resolved Agent Interface configuration produces a safe configuration_error state instead of crashing or prompting for manual endpoint entry.
- [ ] Successful pushes update pushed_at in the local snapshot store.
- [ ] Network errors, timeouts, and non-2xx responses leave pushed_at null.
- [ ] Failed pushes do not crash Intentive or prevent the next heartbeat cycle from running.
- [ ] No raw ScreenPipe data is included in the Agent Interface request.
- [ ] Session End Marker delivery is stubbed — the interface exists but the payload shape and agent-side handling are deferred until the OpenClaw Agent contract is defined.
- [ ] Tests cover resolved-config usage, missing-config behavior, request shape, auth header/credential, success, non-2xx, timeout, network error, and drop-without-retry behavior.

## Blocked by

- #2
- #6
- #8
- #13

## Comments

(No comments.)
