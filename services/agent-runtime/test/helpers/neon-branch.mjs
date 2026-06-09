/**
 * Ephemeral Neon branch lifecycle for Runtime repo-layer integration tests.
 *
 * Each test run creates a throwaway branch, bootstraps the Runtime schema,
 * applies the migration under test, exercises real SQL, and drops the branch in
 * teardown. Local runs skip when Neon credentials are absent.
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
    throw new Error(`Neon API ${init.method ?? "GET"} ${path} -> ${res.status}: ${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function createBranch() {
  const projectId = process.env.NEON_PROJECT_ID;
  const body = await neonApi(`/projects/${projectId}/branches`, {
    method: "POST",
    body: JSON.stringify({
      branch: { name: `test-agent-runtime-${Date.now()}` },
      endpoints: [{ type: "read_write" }],
    }),
  });
  const connectionUri = body.connection_uris?.[0]?.connection_uri;
  if (!connectionUri) {
    throw new Error("Neon branch created without a connection_uri");
  }
  return { branchId: body.branch.id, connectionUri };
}

export async function dropBranch(branchId) {
  if (!branchId) return;
  await neonApi(`/projects/${process.env.NEON_PROJECT_ID}/branches/${branchId}`, {
    method: "DELETE",
  });
}

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
