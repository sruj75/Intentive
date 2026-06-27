#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { SignJWT } from "jose";

const root = resolve(import.meta.dirname, "..");
const cpEnvPath = resolve(root, "services/control-plane/.env");
const env = readEnvFile(cpEnvPath);

const args = parseArgs(process.argv.slice(2));
const subject = args["user-id"] ?? "local-dev-user";
const ttlSeconds = Number(args["ttl-seconds"] ?? 3600);
const authMode = env.INTENTIVE_AUTH_MODE ?? "neon";
const secret = env.INTENTIVE_DEV_AUTH_SECRET;
const issuer = env.NEON_AUTH_ISSUER;
const audience = env.NEON_AUTH_AUDIENCE;

if (authMode !== "local-dev") {
  fail("services/control-plane/.env must set INTENTIVE_AUTH_MODE=local-dev");
}
if (!secret || secret.length < 32) {
  fail("services/control-plane/.env must set INTENTIVE_DEV_AUTH_SECRET to at least 32 characters");
}
if (!issuer || !audience) {
  fail("services/control-plane/.env must set NEON_AUTH_ISSUER and NEON_AUTH_AUDIENCE");
}
if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
  fail("--ttl-seconds must be a positive integer");
}

const now = Math.floor(Date.now() / 1000);
const token = await new SignJWT({})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(subject)
  .setIssuer(issuer)
  .setAudience(audience)
  .setIssuedAt(now)
  .setExpirationTime(now + ttlSeconds)
  .sign(new TextEncoder().encode(secret));

process.stdout.write(`${token}\n`);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      fail(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for ${arg}`);
    }
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

function readEnvFile(path) {
  const entries = {};
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
