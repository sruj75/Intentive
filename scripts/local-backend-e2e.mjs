#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const providerRequire = createRequire(resolve(root, "packages/providers/package.json"));
const runtimeRequire = createRequire(resolve(root, "services/agent-runtime/package.json"));
const { SignJWT } = await import(providerRequire.resolve("jose"));
const wsModule = await import(runtimeRequire.resolve("ws"));
const WebSocket = wsModule.WebSocket ?? wsModule.default;
const cpEnv = readEnvFile(resolve(root, "services/control-plane/.env"));

const controlPlaneUrl = process.env.CONTROL_PLANE_URL ?? "http://localhost:8080";
const userId = process.env.LOCAL_E2E_USER_ID ?? "local-dev-user";
const message = process.env.LOCAL_E2E_MESSAGE ?? "Say hello in one short sentence.";
const timeoutMs = Number(process.env.LOCAL_E2E_TIMEOUT_MS ?? 180_000);
const token = await mintToken(cpEnv, userId);

await request("/consent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
await request("/sibling-invitation/skip", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});

const routing = await request("/agent", { headers: { "x-client-kind": "mobile" } });
const reply = await runWebSocketTurn({
  url: routing.ws_url,
  runtimeJwt: routing.runtime_jwt,
  message,
  timeoutMs,
});

console.log("local backend E2E ok");
console.log(`agent_instance_id=${routing.agent_instance_id}`);
console.log(`reply=${reply.body}`);

async function request(path, init = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const res = await fetch(new URL(path, controlPlaneUrl), {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    const body = parseJsonBody(text);
    if (res.ok) {
      return body;
    }
    lastError = new Error(`${init.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
    if (res.status < 500 || attempt === 8) {
      throw lastError;
    }
    await sleep(attempt * 1500);
  }
  throw lastError;
}

function parseJsonBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function runWebSocketTurn({ url, runtimeJwt, message, timeoutMs }) {
  return new Promise((resolvePromise, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out waiting for companion_message after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once("open", () => {
      socket.send(
        JSON.stringify({
          type: "connect",
          auth_token: runtimeJwt,
          client_kind: "mobile",
          client_version: "local-e2e",
          client_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      );
    });

    socket.on("message", (data) => {
      const event = JSON.parse(data.toString());
      if (event.type === "hello_ok") {
        socket.send(
          JSON.stringify({
            type: "user_message",
            message_id: `local-e2e-${randomUUID()}`,
            body: message,
            sent_at: new Date().toISOString(),
          }),
        );
        return;
      }
      if (event.type === "companion_message") {
        clearTimeout(timer);
        socket.close();
        resolvePromise(event);
        return;
      }
      if (event.type === "runtime_error") {
        clearTimeout(timer);
        socket.close();
        reject(new Error(`Runtime error: ${event.code} ${event.message}`));
      }
    });

    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function mintToken(env, subject) {
  if ((env.INTENTIVE_AUTH_MODE ?? "neon") !== "local-dev") {
    throw new Error("services/control-plane/.env must set INTENTIVE_AUTH_MODE=local-dev");
  }
  const secret = env.INTENTIVE_DEV_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("services/control-plane/.env must set INTENTIVE_DEV_AUTH_SECRET");
  }
  if (!env.NEON_AUTH_ISSUER || !env.NEON_AUTH_AUDIENCE) {
    throw new Error("services/control-plane/.env must set NEON_AUTH_ISSUER and NEON_AUTH_AUDIENCE");
  }

  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuer(env.NEON_AUTH_ISSUER)
    .setAudience(env.NEON_AUTH_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(secret));
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

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
