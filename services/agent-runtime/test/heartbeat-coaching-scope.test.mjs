import assert from "node:assert/strict";
import test from "node:test";

import { createHeartbeatScheduleRepo } from "../dist/index.js";

test("Heartbeat rebuild and due reads are scoped to active oriented Coaching Windows", async () => {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve([
      {
        user_id: "00000000-0000-4000-8000-000000000001",
        last_activity_at: "2026-07-26T08:00:00.000Z",
      },
    ]);
  };
  const repo = createHeartbeatScheduleRepo(sql);

  await repo.selectDue({
    now: new Date("2026-07-26T08:02:00.000Z"),
    floorMs: 120_000,
    limit: 10,
  });
  const candidates = await repo.listAll();

  for (const call of calls) {
    assert.match(call.text, /coaching_windows/i);
    assert.match(call.text, /ended_at\s+IS\s+NULL/i);
    assert.match(call.text, /orientation_status\s*=\s*'completed'/i);
    assert.match(call.text, /orientation_completed_at/i);
    assert.doesNotMatch(
      call.text,
      /COALESCE\s*\(\s*last_monitoring_turn_at\s*,\s*started_at\s*\)/i,
    );
    assert.doesNotMatch(call.text, /agent_instances/i);
  }
  assert.equal(candidates[0].lastActivityAt.toISOString(), "2026-07-26T08:00:00.000Z");
});
