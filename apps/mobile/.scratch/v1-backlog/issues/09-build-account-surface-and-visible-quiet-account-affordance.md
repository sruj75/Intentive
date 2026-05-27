# Build Account Surface and Visible Quiet Account Affordance

Status: open
Labels: ready-for-agent
Opened: 2026-05-22T12:15:40Z
Updated: 2026-05-23T07:19:36Z

## Description

## Parent

#1

## What to build

Add the sheet-like **Account Surface** and visible quiet **Account Affordance** for identity, logout, macOS setup/connection status, runtime or Control Plane connection status, app version/debug, support, and recovery. The Account Affordance location remains TBD until real composer and keyboard behavior are visible.

For users who skipped the initial **Sibling Client Invitation**, the Account Surface provides an explicit path to initiate macOS setup later without causing the skipped Pre-Chat Gate to recur on ordinary app launch.

## Acceptance criteria

- [ ] Liquid Glass Chat Shell exposes a visible but quiet Account Affordance without adding a header or bottom tab.
- [ ] Account Surface opens as a sheet-like utility surface.
- [ ] Account Surface shows signed-in identity and logout.
- [ ] Account Surface shows macOS setup and connection status with a recovery/setup action.
- [ ] A user who previously skipped macOS Setup can initiate sibling-client setup from Account Surface.
- [ ] Account-triggered setup does not change the rule that a skipped eligible gate does not re-block ordinary launch.
- [ ] Account Surface shows runtime or Control Plane connection status.
- [ ] Account Surface shows app version/debug information and support access.
- [ ] Placement decision is documented after checking composer, keyboard, and safe-area behavior.
- [ ] Tests cover reachability, logout path, setup recovery visibility, and post-skip manual setup entry.

## Blocked by

- #5
- #9


## Comments

(No comments.)
