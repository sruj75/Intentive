#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const METADATA_BASE = "http://metadata.google.internal/computeMetadata/v1";
const SECRET_MANAGER_BASE = "https://secretmanager.googleapis.com/v1";

export function parseSecretNames(value) {
  return parseSecretSpecs(value).map((spec) => spec.envName);
}

export function parseSecretSpecs(value) {
  return String(value ?? "")
    .split(/[,\s]+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((entry) => {
      const [envName, secretName = envName] = entry.split("=");
      if (!envName || !secretName) {
        throw new Error(`invalid SECRET_NAMES entry: ${entry}`);
      }
      return { envName, secretName };
    });
}

export async function loadSecrets({
  env = process.env,
  fetchImpl = globalThis.fetch,
  metadataBase = METADATA_BASE,
  secretManagerBase = SECRET_MANAGER_BASE,
} = {}) {
  const specs = parseSecretSpecs(env.SECRET_NAMES);
  if (specs.length === 0) {
    return [];
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("global fetch is unavailable for Secret Manager boot fetch");
  }

  const projectId = env.GOOGLE_CLOUD_PROJECT || env.GCP_PROJECT || env.GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error("GOOGLE_CLOUD_PROJECT is required when SECRET_NAMES is set");
  }

  const token = await fetchAccessToken({ fetchImpl, metadataBase });
  const loaded = [];
  for (const spec of specs) {
    if (env[spec.envName]) {
      continue;
    }
    env[spec.envName] = await fetchSecretValue({
      fetchImpl,
      secretManagerBase,
      projectId,
      name: spec.secretName,
      token,
    });
    loaded.push(spec.envName);
  }
  return loaded;
}

export async function fetchAccessToken({ fetchImpl, metadataBase = METADATA_BASE }) {
  const response = await fetchImpl(`${metadataBase}/instance/service-accounts/default/token`, {
    headers: { "Metadata-Flavor": "Google" },
  });
  if (!response.ok) {
    throw new Error(`metadata token fetch failed with HTTP ${response.status}`);
  }
  const body = await response.json();
  if (!body.access_token) {
    throw new Error("metadata token response did not include access_token");
  }
  return body.access_token;
}

export async function fetchSecretValue({
  fetchImpl,
  secretManagerBase = SECRET_MANAGER_BASE,
  projectId,
  name,
  token,
}) {
  const resource = `${secretManagerBase}/projects/${encodeURIComponent(
    projectId,
  )}/secrets/${encodeURIComponent(name)}/versions/latest:access`;
  const response = await fetchImpl(resource, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`secret ${name} fetch failed with HTTP ${response.status}`);
  }
  const body = await response.json();
  const encoded = body?.payload?.data;
  if (!encoded) {
    throw new Error(`secret ${name} response did not include payload data`);
  }
  return Buffer.from(encoded, "base64").toString("utf8");
}

export async function boot({
  env = process.env,
  argv = process.argv,
  fetchImpl = globalThis.fetch,
} = {}) {
  const loaded = await loadSecrets({ env, fetchImpl });
  if (loaded.length > 0) {
    process.stdout.write(`Loaded ${loaded.length} runtime secrets from Secret Manager\n`);
  }

  const child = spawn(process.execPath, argv.slice(2), {
    env,
    stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => child.kill(signal));
  }
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await boot();
}
