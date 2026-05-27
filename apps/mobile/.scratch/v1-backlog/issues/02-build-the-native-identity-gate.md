# Build the Native Identity Gate

Status: open
Labels: ready-for-agent
Opened: 2026-05-22T12:13:38Z
Updated: 2026-05-22T12:13:38Z

## Description

## Parent

#1

## What to build

Build the minimal signed-out Identity Gate and auth adapter boundary. If production Google OAuth or Apple sign-in credentials are not ready, provide a dev auth provider behind the same interface so the client flow can continue without hardcoding fake auth into screens.

## Acceptance criteria

- [ ] Signed-out users land on a minimal Identity Gate.
- [ ] Identity Gate copy explains continuity rather than selling features.
- [ ] Google OAuth and Apple sign-in are represented through an auth adapter boundary.
- [ ] Dev auth can be used when production credentials are unavailable without changing screen logic.
- [ ] Successful auth advances through the launch resolver into the next required setup state.
- [ ] Tests cover signed-out, auth success, auth failure, and dev-auth paths.

## Blocked by

- #2

## Comments

(No comments.)
