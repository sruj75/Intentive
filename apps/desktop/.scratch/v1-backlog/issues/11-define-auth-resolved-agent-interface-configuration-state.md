# Define Auth-resolved Agent Interface configuration state

Status: open
Labels: enhancement, ready-for-agent
Opened: 2026-05-20T11:10:49Z
Updated: 2026-05-20T11:24:53Z

## Description

## Parent

#1

## What to build

Define the internal Neon Auth-to-Agent Interface bridge that replaces manual endpoint URL and API key configuration.

The product behavior stays the same at the system level: Intentive must connect to the user's OpenClaw Agent before Context Snapshots can be pushed. The changed decision is the configuration path. Users should not type endpoint URLs or API keys. Instead, the user signs in with Google through Neon Auth using the same Gmail identity associated with their OpenClaw Agent, and Intentive resolves the Agent Interface configuration automatically.

Use Neon as the v1 database/auth foundation. Neon Auth is built on Better Auth, and the v1 resolution path should use Neon Auth plus Neon Data API direct reads with RLS for the signed-in user's own agent connection.

This issue should establish the local app state and interfaces that later delivery code can consume without knowing whether the current implementation is a local fixture, development Neon branch, or final production Neon branch.

## Acceptance criteria

- [ ] Define the Auth state model for at least signed_out, signed_in, configured, and configuration_error.
- [ ] Define the signed-in Neon user shape needed by Intentive, such as email/name/avatar or the minimal subset the UI needs.
- [ ] Define the resolved Agent Interface configuration shape consumed internally by push delivery.
- [ ] The resolved configuration can represent endpoint and credential/token details without exposing them in Settings UI.
- [ ] The app can distinguish "signed in" from "ready to push snapshots" when Agent Interface configuration is missing or invalid.
- [ ] Define how Intentive uses Neon Auth session state to read the signed-in user's OpenClaw Agent connection through the Neon Data API.
- [ ] The planned Neon Data API read path relies on RLS or equivalent authorization so a signed-in user can only read their own agent connection.
- [ ] Provide a stub or fixture path so downstream issues can develop against an Auth-resolved configuration before production Neon resources are finalized.
- [ ] Document where this state lives and how #9 should obtain it.
- [ ] Tests or a documented smoke check cover signed_out, signed_in-but-unconfigured, configured, and configuration_error states.

## Blocked by

- #4

## Unblocks

- #9
- #10

## Notes

This is the successor to the legacy manual endpoint/API-key scope from issue #4. It changes how Agent Interface configuration is obtained, not the requirement that Intentive becomes connected to the user's OpenClaw Agent.

## Comments

(No comments.)
