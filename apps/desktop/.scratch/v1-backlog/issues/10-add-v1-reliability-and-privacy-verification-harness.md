# Add v1 reliability and privacy verification harness

Status: open
Labels: enhancement, ready-for-agent
Opened: 2026-05-18T10:34:31Z
Updated: 2026-05-21T12:34:54Z

## Description

## Parent

#1

## What to build

Add the v1 reliability and privacy verification harness around Context Snapshot creation and delivery. A completed slice gives reviewers confidence that Intentive preserves privacy boundaries, writes snapshots before pushing, drops failed pushes deliberately, and keeps future Context Heartbeats running after delivery failures.

## Acceptance criteria

- [ ] Verification covers the summarization prompt constraints for credentials, financial data, and personal identifiers.
- [ ] Verification covers the rule that raw ScreenPipe data is not stored in the local snapshot log.
- [ ] Verification covers local write-before-push ordering.
- [ ] Verification covers push failure behavior for network errors, timeouts, and non-2xx responses.
- [ ] Verification covers the v1 rule that failed pushes are dropped rather than retried.
- [ ] Verification covers the 7-day retention purge.
- [ ] Verification covers that push failure does not stall the next Context Heartbeat.
- [ ] The verification approach avoids depending on a real local model for ordinary automated tests.

## Blocked by

- #8
- #9


## Comments

### 01 @sruj75 — 2026-05-21T12:32:20Z

Verification addendum from the May 21 packaging/permission pass:

Keep #11 focused on reliability/privacy verification, but include the new launch-gating assertions in the harness or documented smoke matrix where they touch privacy:

- Capture Permission Setup is incomplete until Screen & System Audio Recording, Microphone, and Accessibility are granted.
- ScreenPipe must not start before completed Auth plus Capture Permission Setup.
- User-facing verification copy says Intentive and does not expose ScreenPipe diagnostics.
- Release verification must reject permission identities shown as ScreenPipe, lowercase `intentive`, raw helper names, or debug paths.

The signed/notarized DMG mechanics should live in a separate packaging issue; #11 should reference that issue once it exists rather than taking on release engineering itself.

### 02 @sruj75 — 2026-05-21T12:34:54Z

Follow-up links from the packaging issue pass:

- Signed/notarized release packaging: #17
- Product-owned macOS Privacy Settings identity: #18
- Capture Permission Setup and hard permission gates: #19
- Final packaged-app release smoke: #20

#11 should verify privacy/reliability behavior and reference these issues for the launch packaging and permission-identity release gates.
