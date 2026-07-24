import assert from "node:assert/strict";
import test from "node:test";

import { createAgentBackend, createCronBackend } from "../dist/index.js";

const userId = "00000000-0000-4000-8000-000000000001";

test("cron backend validates and persists /crons cards through file writes", async () => {
  const upserts = [];
  const jobs = new Map();
  const repo = {
    upsertQuery(input) {
      upserts.push(input);
      const row = toRow({ id: "job_1", attemptCount: 0, ...input });
      jobs.set(input.path, toJob(row));
      return Promise.resolve([row]);
    },
    loadByPath: async (_userId, path) => jobs.get(path) ?? null,
    listByUser: async () => [...jobs.values()],
  };
  const backend = createCronBackend({
    repo,
    getUserId: () => userId,
    loadUserTz: async () => "UTC",
    clock: () => new Date("2026-06-16T00:00:00.000Z"),
  });

  const result = await backend.write(
    "/pill.md",
    "---\nname: pill\nschedule: every 5m\nstatus: active\n---\nCheck in silently.",
  );

  assert.deepEqual(result, { path: "/pill.md", filesUpdate: null });
  assert.equal(upserts[0].userId, userId);
  assert.equal(upserts[0].nextFireAt.toISOString(), "2026-06-16T00:05:00.000Z");

  const read = await backend.read("/pill.md");
  assert.equal(read.error, undefined);
  assert.match(read.content, /next_fire_at: 2026-06-16T00:05:00.000Z/);

  const edit = await backend.edit("/pill.md", "status: active", "status: cancelled");
  assert.equal(edit.error, undefined);
  assert.equal(upserts.at(-1).status, "cancelled");

  const invalid = await backend.write(
    "/too-fast.md",
    "---\nname: fast\nschedule: every 2m\n---\nToo often.",
  );
  assert.match(invalid.error, /5 minutes/);
});

test("agent backend mounts /crons beside /memories", () => {
  const cronBackend = createCronBackend({
    repo: {
      upsertQuery: () => Promise.resolve([]),
      loadByPath: async () => null,
      listByUser: async () => [],
    },
    getUserId: () => userId,
  });
  const { backend } = createAgentBackend({ store: fakeStore(), cronBackend });

  assert.equal(backend.routePrefixes.includes("/memories/"), true);
  assert.equal(backend.routePrefixes.includes("/crons/"), true);
});

function toRow(job) {
  return {
    id: job.id,
    user_id: job.userId,
    path: job.path,
    name: job.name,
    schedule_kind: job.scheduleKind,
    schedule_expr: job.scheduleExpr,
    tz: job.tz,
    status: job.status,
    next_fire_at: job.nextFireAt?.toISOString() ?? null,
    prompt: job.prompt,
    attempt_count: job.attemptCount,
  };
}

function toJob(row) {
  return {
    id: row.id,
    userId: row.user_id,
    path: row.path,
    name: row.name,
    scheduleKind: row.schedule_kind,
    scheduleExpr: row.schedule_expr,
    tz: row.tz,
    status: row.status,
    nextFireAt: row.next_fire_at ? new Date(row.next_fire_at) : null,
    prompt: row.prompt,
    attemptCount: row.attempt_count,
  };
}

function fakeStore() {
  return {
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    listNamespaces: async () => [],
    search: async () => [],
    batch: async () => [],
  };
}
