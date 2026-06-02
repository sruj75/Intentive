# Navigation and capability are orthogonal axes

The Mobile Client structures code along two deliberately separate axes. `app/` (Expo Router) is the **navigation axis**: thin route shells grouped by UX context (`(gates)`, `(chat)`, `(account)`) that only import and compose a domain's `ui` export. `src/domains/` is the **capability axis**: deep modules grouped by product capability (`auth`, `onboarding`, `chat`, `notifications`, `account`), each following the forward-only layer rule (`types → config → repo → service → runtime → ui`) with cross-cutting only through providers. The single coupling between axes is one-directional: a route shell imports domain `ui`, never the reverse.

**Considered Options**

- Collapse the two — colocate routes inside domain folders ("screaming architecture") so each capability owns its own navigation.
- Make the domain set mirror the navigation groups one-to-one.
- Keep navigation and capability as separate, partially-overlapping axes (chosen).

**Consequences**

- The resemblance between route groups and domains is partial and coincidental, not an identity. `chat` and `account` happen to be ~1:1; `(gates)` deliberately is **not** a domain — it spans the `auth` Identity Gate screen and the `onboarding` Consent + Sibling screens. `notifications` owns zero routes; `auth` owns large non-navigable code (JWT, session) plus one screen.
- A screen lives in the domain that owns its logic. The **Identity Gate** screen is therefore `auth` (it triggers OAuth and establishes a session); `onboarding` owns the Consent Primer + Sibling Invitation screens and the **Launch State Resolver** (the sequence logic, which has no screen of its own).
- The **Launch State Resolver** is a pure `onboarding/service/` function: it receives `LaunchState` (including a `signedIn` flag) and returns a `LaunchDestination`. It does not import the `auth` domain — the signed-in bit arrives as plain input — so it stays a deep, pure module.
- Collapsing the axes was rejected: navigation chrome for the pre-chat funnel (`(gates)`) belongs to a flow that spans two domains, so no single capability folder can own it; and the capability-to-route ratio is too uneven (notifications = 0, chat = large) to force a shared structure. This also avoids fighting Expo Router's filesystem-based `app/` directory.
