# Add v1 reliability and privacy verification harness

Status: open
Labels: enhancement, ready-for-agent
Opened: 2026-05-18T10:34:31Z
Updated: 2026-05-21T12:34:54Z

## Description

## Parent

#1

## What to build

Add the v1 reliability and privacy verification harness around **Context Snapshot** creation and **Protocol** delivery. A completed slice gives reviewers confidence that Intentive preserves privacy boundaries, writes snapshots before emit, uses at-most-once delivery in v1, and keeps **Context Heartbeat** ticks running after delivery failures.

## Acceptance criteria

- [ ] Verification covers the summarization prompt constraints for credentials, financial data, and personal identifiers.
- [ ] Verification covers the rule that raw ScreenPipe data is not stored in the local snapshot log.
- [ ] Verification covers local write-before-emit ordering.
- [ ] Verification covers emit failure behavior for network errors, timeouts, and protocol/gateway rejection.
- [ ] Verification covers the v1 at-most-once rule (no client retry queue; `pushed_at` stays null until ack).
- [ ] Verification covers the 7-day retention purge.
- [ ] Verification covers that emit failure does not stall the next **Context Heartbeat**.
- [ ] The verification approach avoids depending on a real local model for ordinary automated tests.

## Blocked by

- #8
- #9


## Comments

### 01 @sruj75 — 2026-05-21T12:32:20Z

Verification addendum from the May 21 packaging/permission pass:

Keep #10 focused on reliability/privacy verification, but include the new launch-gating assertions in the harness or documented smoke matrix where they touch privacy:

- Capture Permission Setup is incomplete until Screen & System Audio Recording, Microphone, and Accessibility are granted.
- ScreenPipe must not start before completed Auth plus Capture Permission Setup.
- User-facing verification copy says Intentive and does not expose ScreenPipe diagnostics.
- Release verification must reject permission identities shown as ScreenPipe, lowercase `intentive`, raw helper names, or debug paths.

The signed/notarized DMG mechanics live in #13; #10 should reference that issue rather than taking on release engineering itself.

### 02 @sruj75 — 2026-05-21T12:34:54Z

Follow-up links from the packaging issue pass:

- Signed/notarized release packaging: #13
- Product-owned macOS Privacy Settings identity: #14
- Capture Permission Setup and hard permission gates: #15
- Final packaged-app release smoke: #16

#10 should verify privacy/reliability behavior and reference these issues for the launch packaging and permission-identity release gates.
