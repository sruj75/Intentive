import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or NEON_DATABASE_URL is required to apply migrations");
}

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(serviceRoot, "migrations");
const sql = neon(databaseUrl);

await sql.query("CREATE SCHEMA IF NOT EXISTS control_plane");

const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

for (const file of files) {
  const sqlText = await readFile(path.join(migrationsDir, file), "utf8");
  for (const statement of splitStatements(sqlText)) {
    await sql.query(statement);
  }
  console.log(`applied ${file}`);
}

function splitStatements(sqlText) {
  return sqlText
    .split(";")
    .map((statement) => stripSqlComments(statement).trim())
    .filter(Boolean);
}

function stripSqlComments(statement) {
  return statement
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}
