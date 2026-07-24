# Desktop Release

Intentive ships one Apple Silicon release path: a Developer ID signed and notarized `Intentive.app`, installed from a signed/stapled DMG, with Sparkle metadata generated from that exact DMG. The release machinery adapts Omi's signed-artifact audit and the pre-Omi Intentive Apple identity; it does not restore Omi's backend or product release system.

## Established Apple identity

- Developer ID: `Developer ID Application: Srujan Gowda (24D6NXS6H7)`
- Team ID: `24D6NXS6H7`
- Bundle ID: `com.heyintentive.desktop`
- Minimum OS: macOS 14
- Architecture: Apple Silicon (`arm64`) only

The Developer ID and Team ID are public signing metadata. The Apple ID, app-specific password, certificate export, certificate password, and keychain password remain GitHub Actions secrets. The workflow deliberately reuses the pre-Omi secret names:

| Setting                            | Kind                | Purpose                                                                        |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `APPLE_DEVELOPER_ID_CERT`          | secret              | Base64 `.p12` containing the existing Developer ID certificate and private key |
| `APPLE_DEVELOPER_ID_CERT_PASSWORD` | secret              | `.p12` password                                                                |
| `KEYCHAIN_PASSWORD`                | secret              | Ephemeral CI keychain password                                                 |
| `APPLE_ID`                         | secret              | Existing notarization Apple ID                                                 |
| `APPLE_APP_SPECIFIC_PASSWORD`      | secret              | Existing `notarytool` app-specific password                                    |
| `APPLE_TEAM_ID`                    | secret              | `24D6NXS6H7`                                                                   |
| `SPARKLE_PUBLIC_ED_KEY`            | secret              | Public half embedded as `SUPublicEDKey`                                        |
| `SPARKLE_PRIVATE_KEY`              | secret              | Private Ed25519 key used by Sparkle's `sign_update` for each exact DMG         |
| `DESKTOP_POSTHOG_PROJECT_KEY`      | secret              | Production Desktop analytics project key                                       |
| `DESKTOP_SENTRY_DSN`               | repository variable | Existing public Desktop Sentry DSN                                             |

The old Tauri updater keys are not reused: Sparkle has its own Ed25519 format. A static precomputed update signature is forbidden because every DMG has different bytes.

## Release flow

1. Merge the release commit to `main`. Run `desktop-release-candidate.yml` with that exact untagged SHA. Its dedicated Mac launches the real assembled app and records step-level external Accessibility evidence. No tag or public artifact exists yet.
2. Review the uploaded exact-SHA evidence. Start `desktop-release.yml` with the accepted SHA, candidate workflow run ID, and version. The job pauses at the protected `desktop-release-approval` environment; only after approval does it validate the evidence and create `desktop-vX.Y.Z` (or `desktop-vX.Y.Z+BUILD`).
3. The protected workflow builds the release app, signs Sparkle/Sentry inside-out, signs the app with `Intentive-Release.entitlements`, creates an installable DMG with an `/Applications` link, signs/notarizes/staples it, and creates the Sparkle signature from that exact DMG.
4. `smoke-signed-desktop-artifact.sh` verifies identity, Team ID, hardened runtime, Gatekeeper, arm64-only architecture, frameworks/assets/privacy metadata, DMG ticket and contents, appcast metadata, and the cryptographic Sparkle signature. It writes digest evidence.
5. The workflow creates a **draft** GitHub Release. Draft status is load-bearing: artifacts are not exposed through Sparkle before dedicated-Mac acceptance.
6. The workflow resolves the three executable drivers directly from `apps/desktop/macos/scripts/stage2/`. They drive the real N-1 loopback update, clean-TCC Tart checklist, and signed-in full-stack journey respectively; each receives the exact tag, SHA, DMG digest, a fresh output path, and evidence root. No machine-local driver path or repository variable is involved.
7. The protected `desktop-release-stage2-proof` job downloads the exact draft and runs `run-stage2-release-proof.sh`. That repository-owned entry point freshly installs and launches the notarized DMG from `/Applications`, runs the repository-owned launch-at-login proof (`verify-launch-at-login.sh`), executes all three dedicated-Mac drivers, validates five newly produced proof families (`installed-dmg.json`, `launch-at-login.json`, `sparkle-update.json`, `tart-tcc.json`, and `full-stack.json`) plus attachments and identity/digest binding, attaches them to the draft, and only then publishes it. Pre-existing evidence is deleted and cannot satisfy the gate. The launch-at-login proof validates the bundled LaunchAgent registration (bundle-relative `BundleProgram`, `--background`, `RunAtLoad`) and a menu-bar-only background launch; the physical login cycle (no Dock/window flash) and the “Open Intentive” Dock/window restore remain operator-observed and are recorded alongside its JSON.

`desktop-release.yml` is the only workflow allowed to move a release from draft to published. The protected Stage 2 environment is the terminal publication gate; there is no parallel manual publish path.

The protected `desktop-release-stage2-proof` environment supplies:

- variables `INTENTIVE_NEON_AUTH_URL`, `INTENTIVE_CONTROL_PLANE_URL`, `DESKTOP_RELEASE_TEST_USER_ID`, `DESKTOP_STAGE2_OPERATOR`, `DESKTOP_STAGE2_NOTARY_PROFILE`, and `TART_BASE_IMAGE`;
- secrets `DESKTOP_RELEASE_TEST_ACCOUNT_EMAIL` and `DESKTOP_RELEASE_TEST_ACCOUNT_PASSWORD`.

`TART_BASE_IMAGE` must be an immutable OCI reference pinned with `@sha256:...`; floating tags such as `latest` are rejected. The driver signs its separate AX probe with the release identity, then asks the operator to grant Accessibility to that helper only; the candidate's own TCC state remains clean. During the live run the Tart driver presents eight operator checkpoints on the self-hosted Mac, captures evidence after each one, and writes an attestation bound to the current run ID, release tag, candidate SHA, and DMG digest. A prewritten secret cannot satisfy this gate. The signed-in driver mints a fresh JWT for each run; no JWT is stored in GitHub.

`DESKTOP_STAGE2_NOTARY_PROFILE` names a `notarytool` keychain profile configured only on the trusted release Mac. The Sparkle driver uses the already-installed Developer ID identity plus this profile to build, sign, notarize, and staple a private native `0.1.0` baseline from the accepted SHA with build number `candidate - 1`. It never downloads an older public DMG.

The Tart operator still owns the real TCC decisions and logout/login observation, but the driver verifies each resulting product state mechanically. Immediately after the defer and denial checkpoints it reads the candidate's persisted onboarding progress and guest TCC rows, requiring a real `deferred` and then `denied` decision before the founder can proceed to grants. After setup it reads the candidate's persisted settings and archive in the guest, requires final Screen Recording and Microphone grants, capture and audio records, a three-day retention choice, Launch at Login, and a `com.apple.TextEdit` exclusion, then keeps TextEdit frontmost across several capture ticks and proves no TextEdit record was added. A same-duration Finder positive control must add a screen record, preventing a stalled capture loop from passing the exclusion check. The driver relaunches the candidate itself, rechecks durable state, and retains launchd/Background Task Management registration evidence. The Sparkle proof creates a deterministic path/mode/content manifest from the app mounted out of the exact candidate DMG and requires the post-update installed app to have the identical manifest and digest.

## Deterministic gates

```bash
pnpm --dir apps/desktop desktop:accept
pnpm --dir apps/desktop test
pnpm --dir apps/desktop release:smoke
pnpm --dir apps/desktop desktop:check
```

`desktop:accept` builds and launches a real isolated-profile app bundle. A debug-only loopback bridge provides fixture/fault control and state observation with a random bearer token stored mode `0600`; it cannot perform user actions. The external driver uses the macOS AX tree, captures per-step pre/post values, screenshots, AX snapshots, log references, and assertions, and writes `.context/desktop-assembled-acceptance.json` plus `.context/desktop-assembled-evidence/`. The command fails closed when the runner lacks Accessibility permission.

## Clean-permission Tart gate

Use only the disposable `intentive-clean` clone. Never install into or mutate the OCI/local base.

```bash
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:run
```

Inside the visible VM, copy the shared `Intentive.app` to `/Applications`, then verify:

1. Fresh onboarding explains local raw-media boundaries before asking for access.
2. Screen Recording can be granted, denied, or deferred; capture starts only after a live grant and survives relaunch.
3. Optional microphone/system-audio consent fails closed; neither source can fill the text composer.
4. Screen Memory captures/searches a known screen; disabling a source's enable switch (or revoking its macOS permission) stops that source and finalizes the active chunk. There is no global Private Mode (ADR 0012).
5. Retention/exclusion choices survive relaunch; clear-all removes local records/media and emits a tombstone.
6. The Floating Bar remains text-only and ordinary replies do not re-present it.
7. A PMB message presents the bar/edge glow, then acknowledges without a duplicate macOS notification.
8. Updates expose manual check/download/deferred install state without silently installing.

Close and delete only the clone when finished:

```bash
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:close
```

## External evidence boundary

A code change can implement and verify the release machinery, but it cannot honestly claim a public candidate passed Apple notarization, Sparkle update installation, dedicated-Mac launch, or TCC prompts until a real tagged draft and credentials exist. Those results belong to the draft release and its uploaded acceptance evidence, not to a source commit.

## Release-test account teardown

The full-stack signed-in proof (`DESKTOP_STAGE2_FULL_STACK_DRIVER`) signs in as a dedicated, persistent release-test account and drives it against real production, which leaves real rows behind in both `control_plane` and `agent_runtime`. There is no HTTP endpoint for this and no fixed script: `control_plane_app` and `agent_runtime_app` are separate, schema-scoped DB roles, so no single application endpoint can reach both schemas anyway, and a frozen SQL file would silently drift out of date as tables change. Instead, after every full-stack proof, the operating agent purges the account directly through Neon MCP, using this section as its brief rather than a script to run verbatim.

**One-time setup.** After the release-test account's first real sign-in, capture its fixed `control_plane.users.id` (decode the `sub` claim from a minted JWT, then look up `SELECT id FROM control_plane.users WHERE sub = '<that sub>'` via Neon MCP). That UUID is stable for the account's lifetime; store it as the protected environment variable `DESKTOP_RELEASE_TEST_USER_ID` so every future purge starts from it rather than re-deriving it.

**Every purge run, the agent should:**

1. Re-derive the actual current schema first, rather than trusting this doc's table list — call Neon MCP's `get_database_tables` / `describe_table_schema` for the `control_plane` and `agent_runtime` schemas and diff that against the list below. If a table was added, renamed, or gained a new `user_id`-shaped foreign key since this was last updated, include it; don't skip it just because it isn't named here.
2. Before deleting anything, confirm exactly one row exists in `control_plane.users` for the captured id. If it's zero or more than one, stop and report instead of proceeding — that means the id is stale or wrong, not that it's safe to guess.
3. Delete children before parents where a real foreign key exists. As of this writing, known FKs run `control_plane.notification_tickets.device_id -> control_plane.devices.id -> control_plane.users.id`. `agent_runtime`'s tables (`cron_runs`, `cron_jobs`, `deliveries`, `perception_records`, `runtime_turns`, `conversation_messages`, `runtime_events`, `agent_instances`) carry a plain `user_id` column with no DB-enforced FK, but delete log/history tables before the instance row anyway, on the same logic.
4. **Preserve `control_plane.users` and the Neon Auth identity.** The dedicated account is intentionally stable between releases. Delete its generated device, agent, conversation, perception, delivery, cron, and runtime-event rows, then verify the one captured user row still exists.
5. Never touch a Neon branch for this — the point is cleaning the one real production account the proof just used, not a copy of it.
6. If anything looks ambiguous (a table whose ownership by this account isn't obvious, a row count that doesn't match expectations), stop and ask rather than deleting speculatively. Getting a release-test cleanup wrong by leaving a stray row is cheap; getting it wrong by deleting a real user's data is not.

Before deleting, verify the run's `release_marker` reached a production `perception_event`, that the persisted event is the compact privacy-filtered text/metadata shape with no raw frame or media payload, and that a later `retention_expiry` tombstone for that same account reached the Runtime ledger. The driver separately requires the real chat/search response to echo the marker. After the generated-row zero checks pass and the stable user row is confirmed present, write the cleanup receipt requested in the live Stage 2 log. It must bind to that run:

```json
{
  "ok": true,
  "user_id": "<DESKTOP_RELEASE_TEST_USER_ID>",
  "run_id": "<run id printed by the driver>",
  "release_marker": "<release marker printed by the driver>",
  "schema_inspected": true,
  "auth_identity_preserved": true,
  "observed_perception_event": true,
  "observed_privacy_filtered_perception": true,
  "observed_retention_tombstone": true,
  "verified_generated_rows_zero": true
}
```

The full-stack driver waits for this receipt and fails closed if it is absent or mismatched. The cleanup wait runs from its EXIT trap even when capture, Runtime search, PMB, or another production-touching step fails, so a partial proof cannot skip teardown. The same trap restores the prior Keychain token and removes only the validated dedicated account's local profile directory.

Operationally, this is a deliberate operator handoff on the same trusted Mac: while the self-hosted job is waiting, its log prints the run ID, marker, user ID, and absolute receipt path. The founder starts an agent with Neon MCP access on that Mac, gives it those four values plus this teardown section, reviews the resolved row scope, and lets it write the receipt only after the live queries and deletions succeed. The runner and operating agent therefore share the receipt path; no GitHub-hosted process is expected to invoke MCP.
