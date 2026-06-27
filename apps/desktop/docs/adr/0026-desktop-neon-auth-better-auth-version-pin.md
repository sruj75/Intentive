# ADR-0026: Desktop Neon Auth pins better-auth 1.4.18 with a scoped audit ignore

Status: Accepted

## Context

The Desktop Client signs users in through Neon Auth: `IntentiveAuthProvider`
renders `NeonAuthUIProvider` (Google-only, `credentials: false`) and `auth.ts`
wraps `createAuthClient` from `@neondatabase/neon-js/auth`. That UI kit pulls in
`@neondatabase/auth-ui`, which transitively depends on `better-auth`.

Two CI gates put `better-auth` in an irreducible bind:

- **`security-audit` / pnpm audit** flags `better-auth <1.6.2` for
  [GHSA-wxw3-q3m9-c3jr](https://github.com/advisories/GHSA-wxw3-q3m9-c3jr): an
  OAuth callback accepts a mismatched `state` when cookie-backed state storage is
  used without PKCE. Patched in `>=1.6.2`.
- **Frontend (typecheck + build + test)** fails to build any `better-auth >=1.5`,
  because every published `@neondatabase/auth-ui` beta imports `apiKeyClient` from
  `better-auth/client/plugins`. better-auth extracted the apiKey plugin out of
  core at 1.5, so that symbol exists only in `<1.5`.

The "has `apiKeyClient`" range (`<1.5`) and the "patched" range (`>=1.6.2`) are
**disjoint**. No single `better-auth` version satisfies both gates. Flipping the
override between `1.4.18` and `1.6.22` only chooses which gate fails — this ADR
ends that flip-flop.

Crucially, the vulnerable code path is better-auth's **server-side** OAuth
callback handler. Desktop bundles only the better-auth **client** (sign-in
trigger + `getSession`) and delegates the actual OAuth callback to Neon's hosted
auth server (`VITE_NEON_AUTH_URL`), which Neon operates and patches. The
`better-auth` version in our lockfile is the client we ship; it is not the server
that performs `state` validation. The advisory is therefore not reachable in the
artifact we ship.

## Decision

Pin the Desktop Neon-Auth chain to **`better-auth@1.4.18`** (the only line Neon's
`auth-ui` builds against) via `overrides` in `pnpm-workspace.yaml`, and add
**`GHSA-wxw3-q3m9-c3jr` to `auditConfig.ignoreGhsas`** with the reachability
rationale above — mirroring the existing esbuild `ignoreGhsas` precedent (package
present in the tree, vector unreachable in our usage).

Separately, pin `@better-auth/expo>@better-auth/core` to `1.6.20` (Mobile). The
expo plugin declares `@better-auth/core: ^1.6.20`, which otherwise floats onto the
newest core patch and trips the minimum-release-age supply-chain gate. Pinning it
to the version Mobile's own `better-auth@1.6.20` already uses keeps the lockfile on
settled releases and lets us delete the `minimumReleaseAgeExclude` block entirely.

We deliberately did **not**:

- `pnpm patch` `auth-ui` to drop the `apiKeyClient` import and run patched
  `better-auth`. The kit was built against the 1.4 client API; the build fails at
  the _first_ missing symbol, so patching one import risks further silent runtime
  breakage of Google sign-in, plus a patch file to maintain against a beta.
- Hand-roll a direct better-auth client integration to escape the kit now. That is
  the right long-term shape but needs runtime verification of the Tauri OAuth
  redirect flow; it is tracked as the exit below, not done under CI pressure.

## Consequences

- Both CI gates pass: the desktop builds against `1.4.18`, and audit reports the
  advisory as ignored rather than failing.
- The ignore is a documented human judgment scoped to one GHSA. It must be
  revisited if Desktop's threat model changes (e.g. ever running a local
  better-auth server) or if a new advisory lands against `1.4.18`.
- We remain on a Neon Auth beta. Future `@neondatabase/neon-js` bumps can re-open
  this tension; the override comments and this ADR are the breadcrumb.

### Remove this pin + ignore when either holds

- Neon ships an `@neondatabase/auth-ui` built against `better-auth >=1.6.2`
  (no longer importing the pre-1.5 `apiKeyClient`); then bump the override to the
  patched line and drop the `ignoreGhsas` entry, **or**
- Desktop replaces the `auth-ui` kit with a direct better-auth client integration
  (`signIn.social` / `getSession` / `signOut`), removing the dependency on the
  pre-1.5 client API and letting us run patched better-auth for real.
