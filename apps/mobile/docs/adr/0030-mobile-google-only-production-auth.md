# Google-only production auth and lifecycle complexity reduction

Status: accepted; a complexity-reduction pass over the live auth, chat, notifications, account-state, and launch seams (narrows ADR 0012's multi-provider Auth Adapter to Google-only and supersedes its Apple and dev branches; refines 0024, 0027, 0028, 0025)

Date: 2026-07-23

## Context

After the six-seam integration plan (ADRs 0024–0029) reconnected the dormant production adapters, five findings stood between the mounted frontend and a v1-shippable auth/chat/lifecycle flow:

1. **Auth** offered two providers (Apple + Google) plus a `__DEV__`-only dev fake behind a provider-selection layer, but only Google is a working v1 capability. The unused branches were shallow complexity: an `AuthProvider`/`SocialProvider` pair, an `enabled` set, an `includeDev` flag, and a switch on `AuthProviderId` — all to gate two dead paths.
2. **Chat** kept the ready scaffold (capability card + suggestions) as permanent opening rows even after real messages existed, so an empty-state surface never left.
3. **Notifications** were registered from the remounting `(main)` zone, so a navigation/remount could re-arm the one-shot attempt within a single signed-in period.
4. **Account-state replay** bumped a session generation but never re-read `GET /me`, so a replay could not change feature gating after it returned — the ready surface stayed stuck on the original projection.
5. **Launch** exposed a one-frame Identity Gate flash for returning users: the `/` route is mounted before `RootNavigator` replaces into `/chat`, and nothing covered that gap.

## Decision

Collapse all five into one source-of-truth pass, preserving the native Google ID-token → Better Auth → SecureStore → `getUserJwt()` architecture.

### Google-only production authentication

- Remove Apple and dev auth from the UI, provider types, adapter dispatch, implementation files, configuration sets, and tests. Delete `dev-provider.ts` and `neon-provider.ts` and drop them from the pure-core build.
- Collapse the now-shallow provider-selection layer into a Google-only `AuthAdapter`: `signIn()` takes no provider argument and interprets the native client result, telemetry, session restoration, sign-out, and JWT access. `NeonAuthClientPort.signInSocial(provider)` becomes the Google-specific, parameterless `signInWithGoogle()`.
- Replace `enabledAuthProviders` with a single `googleAuthConfigured` capability derived from both public client IDs.
- Show one Google button with pending/disabled state; cancellation stays silent, while missing configuration and recoverable failures show an actionable retry notice.
- Production / internal-production config resolution fails when either Google client ID is missing, preventing an unusable binary from shipping. Dev builds keep the dormant-capability path so the local offline walk and tests stay green.

### Conversation scaffold ownership

- Show the capability card and suggestions only while the Runtime conversation holds zero messages. As soon as a user, historical, or Companion message exists, `projectTimeline` projects only server-truth rows plus any active thinking indicator.
- Keep the local and runtime sessions behaviorally aligned without changing the shared `ConversationSession` interface.

### Signed-in lifecycle ownership

- Move `NotificationsRegistrar` from the remounting `(main)` zone to the persistent root under `LaunchStateProvider`.
- Register exactly once per chat-ready signed-in period: authentication alone
  does not request notification permission. The user becomes eligible after the
  contextual Permissions Intro action completes onboarding; returning ready
  users become eligible on launch. Ordinary rerenders/navigation do not
  re-register, and logout resets the guard for a later user/session.
- Keep denial and retryable failures nonblocking; do not repeatedly prompt during one signed-in period.

### Account-state replay

- Turn education replay into one named restart operation that creates a fresh conversation session and refreshes Account State before the ready surface returns. The first onboarding run keeps the welcome session and refreshes nothing.
- Preserve source-change hydration, but a rerender with the same singleton source does not issue another `GET /me`.

### Resolving launch experience

- Reuse the committed app icon; add no duplicate asset. An opaque white launch curtain sits above the Router while Launch State is `RESOLVING` or the current pathname has not reached its resolved target, preventing the one-frame Identity Gate flash for returning users.
- Center a 96×96 icon and pulse scale `0.94 → 1.0` with opacity `0.65 → 1.0`, reversing every 800 ms. Under Reduce Motion, show the icon statically.
- One VoiceOver label, "Loading Intentive," with progress/busy semantics; the image itself is accessibility-hidden and the curtain blocks interaction with the unresolved route. Remove the curtain only after both hydration resolves and the Router reports the intended `/` or `/chat` pathname.

## Interface changes

- `AuthAdapter.signIn(provider)` → `AuthAdapter.signIn()`.
- `NeonAuthClientPort.signInSocial(provider)` → `NeonAuthClientPort.signInWithGoogle()`.
- Remove `AuthProviderId`, `SocialProvider`, `AuthProvider`, Apple branches, dev-provider construction, and `includeDev`.
- `RuntimeConfig.enabledAuthProviders` → `RuntimeConfig.googleAuthConfigured`.
- No wire-contract, database, Control Plane API, or persisted-state changes.

## Consequences

- The Auth Adapter is a deeper module with one fewer indirection: capability honesty is a single boolean, interpretation is inline, and the UI reaches one button. The offline default (no injected adapter) still advances with zero capability calls, so the `experience-journey` invariant test and its 19 snapshots are preserved (A-auth updated to drop the Apple control and notices added).
- A production build without both Google client IDs fails at config resolution; an internal build with them enables Google and the UI's single button. The physical-device internal-production gate in `docs/RELEASE.md` still gates external distribution.
- Push registration survives `(main)` remounts within a chat-ready signed-in
  period and re-arms only after logout. First-time authentication does not put
  an OS permission prompt in front of the onboarding explanation. The
  `experience-journey` test's avoidance of push calls on the offline default is
  unchanged (no `register` prop ⇒ zero calls).
- Education replay can now change feature access (e.g. gating proactive suggestions) after it returns instead of remaining stuck on the original Account State projection; the deck remains visible until the refresh resolves, and unrelated rerenders never re-read the shared source.
- Returning users no longer see a one-frame Identity Gate flash. The curtain is a presentation-only overlay with no new timeout or retry screen.

## Test and acceptance plan

- Unit-test empty versus non-empty Runtime timelines (history, outbound user messages, replies, thinking state).
- Test Google-only adapter success, cancellation, missing configuration, exchange failure, telemetry, SecureStore session restoration, JWT delegation, and production config failure when either client ID is absent.
- Update the A-scene journey snapshot and assert that neither Apple nor dev controls exist.
- Test chat-ready transitions `false→true→true→false→true`, proving exactly one
  attempt per eligible signed-in period.
- Test replay performs one Account State refresh and applies changed feature access, while unrelated rerenders do not re-read.
- Test the launch curtain remains through `RESOLVING` and route replacement, disappears only on pathname agreement, and becomes static under Reduce Motion.
- Run `pnpm --dir apps/mobile typecheck`, `test`, `test:rn`, architecture/docs checks, and `pnpm harness --scope apps/mobile`.
- Finish with a physical-device internal-production build proving Google returns to the app, survives relaunch through the Better Auth/SecureStore session, and supplies a JWT accepted by Control Plane `GET /me` and `GET /agent`. Do not treat Google as externally releasable until this gate passes.

## Assumptions

- Google is the sole v1 production Auth Provider; Apple and dev auth are intentionally removed rather than parked.
- Push registration follows the selected once-per-chat-ready-signed-in-period
  model.
- Launch hydration retains the existing signed-out fallback on failure; this change does not invent a new timeout or retry screen.
- The committed app icon is the single source of truth for the launch mark; no duplicate asset is added.
