# Add minimal Settings account shell

Status: closed
Labels: enhancement, ready-for-agent
Opened: 2026-05-18T10:32:20Z
Updated: 2026-05-21T03:58:37Z
Closed: 2026-05-21T03:58:37Z

## Description

## Parent

#1

## What to build

Add the Intentive Settings window as a minimal account-oriented surface using Neon Auth UI components as the intended Auth surface.

This slice should let a user open Settings from the menu bar, see the current Auth/account area, and close Settings without affecting any active Capture Session. Use Neon Auth UI components from `@neondatabase/neon-js` for the sign-in/sign-up/account surface shape, but keep the integration shallow enough that #13 can wire the real Auth-resolved Agent Interface configuration state.

Settings is not a developer configuration panel. Do not expose endpoint URL fields, API key fields, ScreenPipe diagnostics, or internal Agent Interface configuration. Those values will be resolved behind Auth in the follow-up #13 issue and consumed by snapshot delivery later.

## Acceptance criteria

- [ ] Settings opens from the menu bar.
- [ ] Settings can be closed without stopping an active Capture Session.
- [ ] Settings includes a minimal Auth/account area for signed-out and signed-in states.
- [ ] The Auth/account surface uses Neon Auth UI components, not throwaway local-only sign in/sign up buttons.
- [ ] Neon Auth UI is configured for Google as the intended OAuth provider.
- [ ] Signed-in state has a clear home for account identity and log out behavior, even if #13 still owns full Agent Interface configuration resolution.
- [ ] Settings does not expose manual endpoint URL or API key fields.
- [ ] Settings does not expose ScreenPipe diagnostics or internal readiness details.
- [ ] Settings may mirror user-facing Intentive capture state such as "capturing" / "not capturing," but the menu bar remains the primary Capture Session control surface.
- [ ] Tests or a documented smoke check verify Settings opens/closes independently from Capture Session state and renders the expected Auth/account states.

## Blocked by

- #3

## Follow-up

- #13 defines the Auth-resolved Agent Interface configuration state that replaces manual endpoint/API key persistence and connects the signed-in Neon user to the OpenClaw Agent endpoint/credential.

## Comments

(No comments.)
