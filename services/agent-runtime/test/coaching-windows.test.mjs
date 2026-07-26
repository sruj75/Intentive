import assert from "node:assert/strict";
import test from "node:test";

import { createCoachingWindowsRepo } from "../dist/index.js";

const userId = "00000000-0000-4000-8000-000000000001";
const windowId = "11111111-1111-4111-8111-111111111111";

test("a Window Start supersedes only an older active window and creates one pending orientation", () => {
  const calls = [];
  const repo = createCoachingWindowsRepo(capturingSql(calls));

  const queries = repo.projectLifecycle(userId, {
    type: "coaching_window_started",
    window_id: windowId,
    started_at: "2026-07-26T08:00:00.000Z",
    reason: "app_launch",
  });

  assert.equal(queries.length, 2);
  assert.match(calls[0].text, /runtime_events/i);
  assert.match(calls[0].text, /start_ingest_seq\s*</i);
  assert.match(calls[0].text, /ended_at\s+IS\s+NULL/i);
  assert.match(calls[0].text, /window_id\s*<>\s*/i);
  assert.match(calls[0].text, /superseded/i);
  assert.match(calls[1].text, /start_ingest_seq/i);
  assert.match(calls[1].text, /runtime_events/i);
  assert.match(calls[1].text, /NOT\s+EXISTS[\s\S]*ended_at\s+IS\s+NULL/i);
  assert.match(calls[1].text, /orientation_status/i);
  assert.match(calls[1].text, /ON\s+CONFLICT\s+\(user_id,\s*window_id\)\s+DO\s+NOTHING/i);
  assert.equal(calls[1].values.includes(`opening:${windowId}`), true);
});

test("a Window End closes only the matching active window", () => {
  const calls = [];
  const repo = createCoachingWindowsRepo(capturingSql(calls));

  const queries = repo.projectLifecycle(userId, {
    type: "coaching_window_ended",
    window_id: windowId,
    ended_at: "2026-07-26T09:00:00.000Z",
    reason: "pause",
  });

  assert.equal(queries.length, 1);
  assert.match(calls[0].text, /window_id\s*=\s*/i);
  assert.match(calls[0].text, /ended_at\s+IS\s+NULL/i);
});

test("opening orientation reuses a committed ready message before claiming pending work", async () => {
  const calls = [];
  const repo = createCoachingWindowsRepo(
    capturingSql(calls, [
      [
        {
          user_id: userId,
          window_id: windowId,
          orientation_message_id: `opening:${windowId}`,
          body: "What important outcome should we protect?",
        },
      ],
    ]),
  );

  assert.deepEqual(await repo.claimOpening(userId, windowId), {
    userId,
    windowId,
    messageId: `opening:${windowId}`,
    body: "What important outcome should we protect?",
  });
  assert.match(calls[0].text, /orientation_status\s*=\s*'ready'/i);
  assert.match(calls[0].text, /conversation_messages/i);
  assert.match(calls[0].text, /message\.message_id\s*=\s*window\.orientation_message_id/i);
  assert.match(calls[0].text, /message\.author\s*=\s*'companion'/i);
  assert.match(calls[0].text, /message\.window_id\s*=\s*window\.window_id/i);
  assert.match(calls[0].text, /message\.via_post_message_back\s*=\s*true/i);
});

test("opening orientation immediately reclaims interrupted running work on the next serialized presence", async () => {
  const calls = [];
  const repo = createCoachingWindowsRepo(
    capturingSql(calls, [
      [],
      [
        {
          user_id: userId,
          window_id: windowId,
          orientation_message_id: `opening:${windowId}`,
        },
      ],
    ]),
  );

  assert.deepEqual(await repo.claimOpening(userId, windowId), {
    userId,
    windowId,
    messageId: `opening:${windowId}`,
    body: null,
  });
  assert.match(calls[1].text, /orientation_status\s*=\s*'running'/i);
  assert.match(calls[1].text, /orientation_status\s+IN\s*\(\s*'pending'\s*,\s*'running'\s*\)/i);
  assert.match(calls[1].text, /orientation_claimed_at/i);
  assert.match(calls[1].text, /ended_at\s+IS\s+NULL/i);
  assert.doesNotMatch(calls[1].text, /interval/i);
});

test("an authenticated delivery acknowledgement completes only its active ready opening", async () => {
  const calls = [];
  const messageId = `opening:${windowId}`;
  const repo = createCoachingWindowsRepo(
    capturingSql(calls, [
      [
        {
          user_id: userId,
          window_id: windowId,
          started_at: "2026-07-26T08:00:00.000Z",
          orientation_completed_at: "2026-07-26T08:00:05.000Z",
          evidence_cursor: null,
          evidence_version: null,
          last_monitoring_turn_at: null,
        },
      ],
    ]),
  );

  assert.deepEqual(await repo.acknowledgeOpening(userId, messageId), {
    userId,
    windowId,
    startedAt: new Date("2026-07-26T08:00:00.000Z"),
    orientationCompletedAt: new Date("2026-07-26T08:00:05.000Z"),
    evidenceCursor: null,
    evidenceVersion: null,
    lastMonitoringTurnAt: null,
  });

  assert.match(calls[0].text, /orientation_status\s*=\s*'completed'/i);
  assert.match(calls[0].text, /orientation_completed_at/i);
  assert.match(calls[0].text, /orientation_message_id\s*=\s*/i);
  assert.match(calls[0].text, /user_id\s*=\s*/i);
  assert.match(calls[0].text, /ended_at\s+IS\s+NULL/i);
  assert.equal(calls[0].values.includes(messageId), true);
});

test("opening ready and failure transitions remain scoped to an active matching window", () => {
  const calls = [];
  const repo = createCoachingWindowsRepo(capturingSql(calls));

  repo.markOpeningReadyQuery(userId, windowId);
  repo.releaseOpeningQuery(userId, windowId);

  assert.match(calls[0].text, /orientation_status\s*=\s*'ready'/i);
  assert.match(calls[0].text, /window_id\s*=\s*/i);
  assert.match(calls[0].text, /ended_at\s+IS\s+NULL/i);
  assert.match(calls[0].text, /EXISTS[\s\S]*conversation_messages/i);
  assert.match(
    calls[0].text,
    /message\.message_id\s*=\s*coaching_windows\.orientation_message_id/i,
  );
  assert.match(calls[0].text, /message\.author\s*=\s*'companion'/i);
  assert.match(calls[0].text, /message\.window_id\s*=\s*coaching_windows\.window_id/i);
  assert.match(calls[0].text, /message\.via_post_message_back\s*=\s*true/i);
  assert.match(calls[1].text, /orientation_status\s*=\s*'pending'/i);
  assert.match(calls[1].text, /orientation_status\s*=\s*'running'/i);
});

test("active-window authorization is scoped to the user and matching window", async () => {
  const calls = [];
  const repo = createCoachingWindowsRepo(capturingSql(calls, [[{ active: true }], []]));

  assert.equal(await repo.isActive(userId, windowId), true);
  assert.equal(await repo.isActive(userId, "22222222-2222-4222-8222-222222222222"), false);
  assert.match(calls[0].text, /user_id\s*=\s*/i);
  assert.match(calls[0].text, /window_id\s*=\s*/i);
  assert.match(calls[0].text, /ended_at\s+IS\s+NULL/i);
});

test("monitoring state exposes only an active oriented window and its successful cursor", async () => {
  const calls = [];
  const repo = createCoachingWindowsRepo(
    capturingSql(calls, [
      [
        {
          user_id: userId,
          window_id: windowId,
          started_at: "2026-07-26T08:00:00.000Z",
          orientation_completed_at: "2026-07-26T08:00:05.000Z",
          evidence_cursor: "41",
          evidence_version: "v4",
          last_monitoring_turn_at: "2026-07-26T08:04:00.000Z",
        },
      ],
    ]),
  );

  assert.deepEqual(await repo.readMonitoringState(userId), {
    userId,
    windowId,
    startedAt: new Date("2026-07-26T08:00:00.000Z"),
    orientationCompletedAt: new Date("2026-07-26T08:00:05.000Z"),
    evidenceCursor: 41,
    evidenceVersion: "v4",
    lastMonitoringTurnAt: new Date("2026-07-26T08:04:00.000Z"),
  });
  assert.match(calls[0].text, /orientation_status\s*=\s*'completed'/i);
  assert.match(calls[0].text, /ended_at\s+IS\s+NULL/i);
});

test("successful Monitoring Turn cursor advancement is matching-window guarded", () => {
  const calls = [];
  const repo = createCoachingWindowsRepo(capturingSql(calls));
  const completedAt = new Date("2026-07-26T08:06:00.000Z");

  repo.advanceEvidenceQuery({
    userId,
    windowId,
    cursorEnd: 52,
    evidenceVersion: "v5",
    completedAt,
  });

  assert.match(calls[0].text, /evidence_cursor/i);
  assert.match(calls[0].text, /last_monitoring_turn_at/i);
  assert.match(calls[0].text, /window_id\s*=\s*/i);
  assert.match(calls[0].text, /ended_at\s+IS\s+NULL/i);
  assert.equal(calls[0].values.includes(52), true);
});

test("failed Monitoring Turn judgment timestamp is matching-window guarded without cursor mutation", () => {
  const calls = [];
  const repo = createCoachingWindowsRepo(capturingSql(calls));
  const attemptedAt = new Date("2026-07-26T08:06:00.000Z");

  repo.recordJudgmentAttemptQuery({ userId, windowId, attemptedAt });

  assert.match(calls[0].text, /last_monitoring_turn_at/i);
  assert.doesNotMatch(calls[0].text, /evidence_cursor\s*=/i);
  assert.doesNotMatch(calls[0].text, /evidence_version\s*=/i);
  assert.match(calls[0].text, /window_id\s*=\s*/i);
  assert.match(calls[0].text, /ended_at\s+IS\s+NULL/i);
  assert.equal(calls[0].values.includes(attemptedAt), true);
});

function capturingSql(calls, results = []) {
  return (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(results.shift() ?? []);
  };
}
