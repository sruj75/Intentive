/**
 * Ephemeral Neon branch lifecycle for repo-layer integration tests (ADR-0003).
 *
 * Each test run creates a throwaway branch off the project, applies the
 * migration under test, exercises the real SQL, and drops the branch in
 * teardown. The branch never touches production — it is disposable test
 * infrastructure, and #50 still owns production provisioning.
 *
 * This plumbing is built once in #23 and reused across the Control Plane lane
 * (#26/#27/#30). It is *opt-in*: callers gate on `hasNeonBranchCreds()` and
 * skip the integration test when `NEON_API_KEY` / `NEON_PROJECT_ID` are absent,
 * so `pnpm test` stays green locally without credentials while CI runs it for
 * real.
 */

import { readFile } from "node:fs/promises";

const API_BASE = "https://console.neon.tech/api/v2";

export function hasNeonBranchCreds() {
  return Boolean(process.env.NEON_API_KEY && process.env.NEON_PROJECT_ID);
}

async function neonApi(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.NEON_API_KEY}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Neon API ${init.method ?? "GET"} ${path} → ${res.status}: ${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

/**
 * Create a disposable branch with a read-write compute and return its id plus a
 * pooled connection string. Caller must `dropBranch(branchId)` in teardown.
 */
export async function createBranch() {
  const projectId = process.env.NEON_PROJECT_ID;
  const body = await neonApi(`/projects/${projectId}/branches`, {
    method: "POST",
    body: JSON.stringify({
      branch: { name: `test-identity-${Date.now()}` },
      endpoints: [{ type: "read_write" }],
    }),
  });
  const branchId = body.branch?.id;
  const connection = branchId
    ? await neonApi(
        `/projects/${projectId}/connection_uri?${new URLSearchParams({
          branch_id: branchId,
          database_name: "neondb",
          role_name: "neondb_owner",
          pooled: "true",
        })}`,
      )
    : null;
  const connectionUri =
    connection?.uri ?? connection?.connection_uri ?? body.connection_uris?.[0]?.connection_uri;
  if (!connectionUri) {
    throw new Error("Neon branch created without a connection_uri");
  }
  return { branchId, connectionUri };
}

export async function dropBranch(branchId) {
  if (!branchId) return;
  await neonApi(`/projects/${process.env.NEON_PROJECT_ID}/branches/${branchId}`, {
    method: "DELETE",
  });
}

/**
 * Run one or more SQL statements against a branch over the Neon HTTP driver.
 * Statements are split on `;` so a `.sql` migration file (single or multi
 * statement) applies in order.
 */
export async function applySql(connectionUri, sqlText) {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(connectionUri);
  const statements = sqlText
    .split(";")
    .map((s) => stripSqlComments(s).trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await sql.query(statement);
  }
}

export async function applyMigrationFile(connectionUri, absPath) {
  const sqlText = await readFile(absPath, "utf8");
  await applySql(connectionUri, sqlText);
}

/** Build a tagged-template `sql` bound to a branch, for use as the repo's port. */
export async function connect(connectionUri) {
  const { neon } = await import("@neondatabase/serverless");
  return neon(connectionUri);
}

function stripSqlComments(statement) {
  return statement
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}
