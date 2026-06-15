import assert from "node:assert/strict";
import test from "node:test";

import { parseCard, renderCard } from "../dist/index.js";

test("cron cards round-trip frontmatter and prompt body", () => {
  const card = parseCard(
    renderCard({
      id: "job_1",
      userId: "user_1",
      path: "/pill.md",
      name: "pill",
      scheduleKind: "every",
      scheduleExpr: "5m",
      tz: "Asia/Kolkata",
      status: "active",
      nextFireAt: new Date("2026-06-16T00:05:00.000Z"),
      prompt: "Check whether the pill reminder matters.",
      attemptCount: 0,
    }),
  );

  assert.deepEqual(card, {
    name: "pill",
    schedule: { kind: "every", expr: "5m" },
    tz: "Asia/Kolkata",
    status: "active",
    nextFireAt: new Date("2026-06-16T00:05:00.000Z"),
    prompt: "Check whether the pill reminder matters.",
  });
});

test("cron card parse rejects missing required fields", () => {
  assert.throws(() => parseCard("---\nname: pill\n---\nbody"), /schedule/);
  assert.throws(() => parseCard("name: pill\nbody"), /frontmatter/);
});
