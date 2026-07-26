import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { applyMigrationText, splitMigrationStatements } from "../scripts/lib/migration-runner.mjs";

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("one migration file is submitted as one ordered database transaction", async () => {
  const seen = [];
  const sql = {
    transaction: async (buildQueries) => {
      const queries = buildQueries({
        query: (statement) => {
          seen.push(statement);
          return { statement };
        },
      });
      assert.equal(queries.length, 3);
      return [[], [], []];
    },
  };

  await applyMigrationText(
    sql,
    `
      CREATE TABLE example (id bigint);
      ALTER TABLE example ADD COLUMN name text;
      UPDATE example SET name = 'ready';
    `,
  );

  assert.deepEqual(seen, [
    "CREATE TABLE example (id bigint)",
    "ALTER TABLE example ADD COLUMN name text",
    "UPDATE example SET name = 'ready'",
  ]);
});

test("Coaching migration keeps ingest column, backfill, and NOT NULL in the same transaction", async () => {
  const migration = await readFile(
    path.join(serviceRoot, "migrations", "0013_desktop_coaching_windows.sql"),
    "utf8",
  );
  assert.doesNotMatch(migration, /\bAS\s+window\b/i);
  assert.match(migration, /\bAS\s+coaching_window\b/i);
  const statements = splitMigrationStatements(migration);
  const addIndex = statements.findIndex((statement) =>
    /ADD COLUMN IF NOT EXISTS ingest_seq bigint/i.test(statement),
  );
  const backfillIndex = statements.findIndex((statement) =>
    /WITH existing AS[\s\S]*UPDATE agent_runtime\.runtime_events/i.test(statement),
  );
  const defaultIndex = statements.findIndex((statement) =>
    /ALTER COLUMN ingest_seq SET DEFAULT nextval/i.test(statement),
  );
  const notNullIndex = statements.findIndex((statement) =>
    /ALTER COLUMN ingest_seq SET NOT NULL/i.test(statement),
  );

  assert.ok(addIndex >= 0);
  assert.ok(defaultIndex > addIndex);
  assert.ok(defaultIndex < backfillIndex);
  assert.ok(backfillIndex > addIndex);
  assert.ok(notNullIndex > backfillIndex);

  let transactionCalls = 0;
  await applyMigrationText(
    {
      transaction: async (buildQueries) => {
        transactionCalls += 1;
        return buildQueries({ query: (statement) => ({ statement }) });
      },
    },
    migration,
  );
  assert.equal(transactionCalls, 1);
});
