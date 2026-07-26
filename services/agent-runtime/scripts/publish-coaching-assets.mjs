#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createLangfusePublicApiClient,
  LangfusePublicApiError,
} from "./lib/langfuse-public-api.mjs";
import { PROCEDURE_FLOOR_PROMPT_NAME } from "../dist/domains/bundles/types/floor.js";

const serviceRoot = path.resolve(import.meta.dirname, "..");
const expectedPromptName = PROCEDURE_FLOOR_PROMPT_NAME;

async function main() {
  let options = null;
  let remoteApplyStarted = false;
  let remoteMutationAttempted = false;
  try {
    options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(helpText());
      return;
    }
    const assets = await loadAssets(options);
    const plan = createPlanEvidence(assets);
    if (options.apply) {
      const configuration = readApplyConfiguration(options);
      const client = createLangfusePublicApiClient(configuration);
      remoteApplyStarted = true;
      const applied = await applyAssets({
        assets,
        client,
        onMutation() {
          remoteMutationAttempted = true;
        },
      });
      const evidence = {
        ...plan,
        mode: "apply",
        remote_mutation: remoteMutationAttempted,
        changes: applied.changes,
        verification: applied.verification,
      };
      await emitEvidence(evidence, options.evidencePath);
      return;
    }
    await emitEvidence(plan, options.evidencePath);
  } catch (error) {
    const safe = safeError(error);
    if (remoteApplyStarted && options?.evidencePath) {
      try {
        await writeEvidence(options.evidencePath, {
          schema_version: 1,
          mode: "apply",
          status: "failed",
          remote_mutation: remoteMutationAttempted,
          error: safe.error,
          verification: {
            performed: safe.error === "verification_failed",
            passed: false,
          },
        });
      } catch {
        // Preserve the original, content-free failure as the command result.
      }
    }
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  }
}

function readApplyConfiguration(options) {
  if (!options.evidencePath) {
    throw new ReleaseToolError(
      "evidence_path_required",
      "--apply requires --evidence PATH so verification results are retained.",
    );
  }
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_HOST;
  if (!publicKey || !secretKey || !baseUrl) {
    throw new ReleaseToolError(
      "langfuse_configuration_missing",
      "--apply requires LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL (or LANGFUSE_HOST).",
    );
  }
  return { baseUrl, publicKey, secretKey };
}

async function applyAssets({ assets, client, onMutation = () => {} }) {
  const changes = {
    prompts_verified: 0,
    dataset_created: 0,
    dataset_unchanged: 0,
    items_created: 0,
    items_updated: 0,
    items_unchanged: 0,
  };

  const procedureFloor = await client.getPrompt(expectedPromptName);
  if (!productionPromptIsAvailable(procedureFloor)) {
    throw new ReleaseToolError(
      "prompt_unavailable",
      `Required Langfuse production prompt is unavailable: ${expectedPromptName}.`,
    );
  }
  changes.prompts_verified = 1;

  const existingDataset = await client.getDataset(assets.dataset.name);
  if (existingDataset) {
    changes.dataset_unchanged += 1;
  } else {
    onMutation();
    await client.createDataset({
      name: assets.dataset.name,
      description: assets.dataset.description,
      metadata: assets.dataset.metadata,
    });
    changes.dataset_created += 1;
  }

  for (const item of assets.dataset.items) {
    const payload = datasetItemPayload(assets.dataset, item);
    const existing = await client.getDatasetItem(payload.id);
    if (datasetItemMatches(existing, payload)) {
      changes.items_unchanged += 1;
      continue;
    }
    onMutation();
    await client.upsertDatasetItem(payload);
    if (existing) changes.items_updated += 1;
    else changes.items_created += 1;
  }

  await verifyAssets({ assets, client });
  return {
    changes,
    verification: {
      performed: true,
      passed: true,
      prompt_count: 1,
      dataset_item_count: assets.dataset.items.length,
    },
  };
}

async function verifyAssets({ assets, client }) {
  if (!productionPromptIsAvailable(await client.getPrompt(expectedPromptName))) {
    throw new ReleaseToolError(
      "verification_failed",
      "The Langfuse production Procedure Floor prompt was unavailable.",
    );
  }

  if (!(await client.getDataset(assets.dataset.name))) {
    throw new ReleaseToolError(
      "verification_failed",
      "The coaching evaluation dataset was not found after apply.",
    );
  }
  for (const item of assets.dataset.items) {
    const payload = datasetItemPayload(assets.dataset, item);
    if (!datasetItemMatches(await client.getDatasetItem(payload.id), payload)) {
      throw new ReleaseToolError(
        "verification_failed",
        "A coaching evaluation dataset item did not match after apply.",
      );
    }
  }
}

function productionPromptIsAvailable(remote) {
  return (
    remote?.type === "text" &&
    typeof remote.prompt === "string" &&
    remote.prompt.trim().length > 0 &&
    Array.isArray(remote.labels) &&
    remote.labels.includes("production")
  );
}

function datasetItemPayload(dataset, item) {
  const expectedOutput = item.expected_output;
  const contentHash = sha256(stableJson({ input: item.input, expectedOutput }));
  return {
    id: stableItemId(dataset.name, item.id),
    datasetName: dataset.name,
    input: item.input,
    expectedOutput,
    metadata: {
      intentive_case_id: item.id,
      intentive_content_sha256: contentHash,
      intentive_dataset_version: dataset.metadata?.version ?? 1,
      intentive_source: "services/agent-runtime/evals/desktop-performance-coach-v1.json",
    },
    status: "ACTIVE",
  };
}

function datasetItemMatches(remote, expected) {
  if (!remote) return false;
  return (
    stableJson({
      id: remote.id,
      datasetName: remote.datasetName,
      input: remote.input,
      expectedOutput: remote.expectedOutput,
      metadata: remote.metadata,
      status: remote.status,
    }) === stableJson(expected)
  );
}

function parseArguments(arguments_) {
  const options = {
    apply: false,
    datasetPath: path.join(serviceRoot, "evals", "desktop-performance-coach-v1.json"),
    evidencePath: null,
    help: false,
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--") {
      continue;
    }
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--dataset" || argument === "--evidence") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) {
        throw new ReleaseToolError("invalid_arguments", `${argument} requires a path.`);
      }
      index += 1;
      const resolved = path.resolve(process.cwd(), value);
      if (argument === "--dataset") options.datasetPath = resolved;
      if (argument === "--evidence") options.evidencePath = resolved;
      continue;
    }
    throw new ReleaseToolError("invalid_arguments", `Unknown argument: ${argument}`);
  }

  return options;
}

async function loadAssets(options) {
  let dataset;
  try {
    dataset = JSON.parse(await readFile(options.datasetPath, "utf8"));
  } catch {
    throw new ReleaseToolError("dataset_invalid", "The coaching dataset is not valid JSON.");
  }
  validateDataset(dataset);

  return { dataset };
}

function validateDataset(dataset) {
  if (
    !dataset ||
    dataset.name !== "desktop-performance-coach-v1" ||
    !Array.isArray(dataset.items) ||
    dataset.items.length !== 9
  ) {
    throw new ReleaseToolError(
      "dataset_invalid",
      "The release dataset must be desktop-performance-coach-v1 with exactly nine items.",
    );
  }
  const ids = new Set();
  for (const item of dataset.items) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.input ||
      typeof item.input !== "object" ||
      !item.expected_output ||
      typeof item.expected_output !== "object" ||
      ids.has(item.id)
    ) {
      throw new ReleaseToolError(
        "dataset_invalid",
        "Every coaching dataset item needs a unique id, input, and expected_output.",
      );
    }
    ids.add(item.id);
  }
}

function createPlanEvidence({ dataset }) {
  return {
    schema_version: 1,
    mode: "plan",
    remote_mutation: false,
    label: "production",
    prompts: [{ name: expectedPromptName }],
    dataset: {
      name: dataset.name,
      sha256: sha256(stableJson(dataset)),
      item_count: dataset.items.length,
      items: dataset.items.map((item) => ({
        case_id: item.id,
        remote_id: stableItemId(dataset.name, item.id),
        sha256: sha256(
          stableJson({
            input: item.input,
            expectedOutput: item.expected_output,
          }),
        ),
      })),
    },
    verification: {
      performed: false,
      passed: false,
    },
  };
}

function stableItemId(datasetName, caseId) {
  const urlNamespace = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
  const bytes = createHash("sha1")
    .update(urlNamespace)
    .update(`${datasetName}:${caseId}`, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key])]),
    );
  }
  return value;
}

async function emitEvidence(evidence, evidencePath) {
  const rendered = `${JSON.stringify(evidence, null, 2)}\n`;
  if (evidencePath) {
    await writeEvidence(evidencePath, evidence);
  }
  process.stdout.write(rendered);
}

async function writeEvidence(evidencePath, evidence) {
  const rendered = `${JSON.stringify(evidence, null, 2)}\n`;
  await mkdir(path.dirname(evidencePath), { recursive: true });
  const temporaryPath = `${evidencePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, rendered, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, evidencePath);
}

function safeError(error) {
  if (error instanceof ReleaseToolError || error instanceof LangfusePublicApiError) {
    return { error: error.code, message: error.message };
  }
  return { error: "release_tool_failed", message: "Langfuse release tooling failed." };
}

function helpText() {
  return [
    "Plan or apply the Desktop Performance Coach Langfuse assets.",
    "",
    "Usage:",
    "  node scripts/publish-coaching-assets.mjs [--evidence PATH]",
    "  node scripts/publish-coaching-assets.mjs --apply --evidence PATH",
    "",
    "The default is a local, content-free plan. Remote writes require --apply.",
    "",
  ].join("\n");
}

class ReleaseToolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

await main();
