import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import test from "node:test";

const serviceRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(serviceRoot, "scripts", "publish-coaching-assets.mjs");

test("the default command emits a content-free plan without credentials or remote writes", async () => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "intentive-langfuse-plan-"));
  const evidencePath = path.join(tempDirectory, "evidence.json");
  const env = withoutLangfuseCredentials(process.env);

  const result = spawnSync(process.execPath, [scriptPath, "--evidence", evidencePath], {
    cwd: serviceRoot,
    encoding: "utf8",
    env,
  });

  assert.equal(result.status, 0, result.stderr);

  const plan = JSON.parse(result.stdout);
  assert.equal(plan.mode, "plan");
  assert.equal(plan.remote_mutation, false);
  assert.equal(plan.verification.performed, false);
  assert.deepEqual(
    plan.prompts.map(({ name }) => name),
    ["intentive-runtime-bundle"],
  );
  assert.equal(plan.dataset.name, "desktop-performance-coach-v1");
  assert.equal(plan.dataset.item_count, 9);

  const durableEvidence = JSON.parse(await readFile(evidencePath, "utf8"));
  assert.deepEqual(durableEvidence, plan);

  const rendered = `${result.stdout}\n${await readFile(evidencePath, "utf8")}`;
  assert.doesNotMatch(rendered, /You are the Intentive Companion/);
  assert.doesNotMatch(rendered, /A deliberately specific sentence that must remain temporary/);
});

test("--apply fails closed unless explicit Langfuse credentials and an evidence path are present", () => {
  const result = spawnSync(process.execPath, [scriptPath, "--apply", "--evidence", "unused.json"], {
    cwd: serviceRoot,
    encoding: "utf8",
    env: withoutLangfuseCredentials(process.env),
  });

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stderr), {
    error: "langfuse_configuration_missing",
    message:
      "--apply requires LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL (or LANGFUSE_HOST).",
  });
  assert.equal(result.stdout, "");
});

test(
  "--apply upserts once, verifies production assets, and becomes a no-write rerun",
  { timeout: 20_000 },
  async () => {
    const fake = await createFakeLangfuse({ seededPrompts: productionPrompts() });
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "intentive-langfuse-apply-"));
    const firstEvidencePath = path.join(tempDirectory, "first.json");
    const secondEvidencePath = path.join(tempDirectory, "second.json");
    const env = {
      ...withoutLangfuseCredentials(process.env),
      LANGFUSE_PUBLIC_KEY: "pk-test-project",
      LANGFUSE_SECRET_KEY: "sk-test-project",
      LANGFUSE_BASE_URL: fake.baseUrl,
    };

    try {
      const first = await runTool(["--apply", "--evidence", firstEvidencePath], env);
      assert.equal(first.status, 0, first.stderr);
      const firstEvidence = JSON.parse(first.stdout);
      assert.deepEqual(firstEvidence.changes, {
        prompts_verified: 1,
        dataset_created: 1,
        dataset_unchanged: 0,
        items_created: 9,
        items_updated: 0,
        items_unchanged: 0,
      });
      assert.deepEqual(firstEvidence.verification, {
        performed: true,
        passed: true,
        prompt_count: 1,
        dataset_item_count: 9,
      });
      assert.equal(firstEvidence.remote_mutation, true);
      assert.equal(fake.writeCount, 10);
      assert.deepEqual(JSON.parse(await readFile(firstEvidencePath, "utf8")), firstEvidence);

      const second = await runTool(["--apply", "--evidence", secondEvidencePath], env);
      assert.equal(second.status, 0, second.stderr);
      const secondEvidence = JSON.parse(second.stdout);
      assert.deepEqual(secondEvidence.changes, {
        prompts_verified: 1,
        dataset_created: 0,
        dataset_unchanged: 1,
        items_created: 0,
        items_updated: 0,
        items_unchanged: 9,
      });
      assert.equal(secondEvidence.remote_mutation, false);
      assert.equal(secondEvidence.verification.passed, true);
      assert.equal(fake.writeCount, 10);

      const rendered = [
        first.stdout,
        second.stdout,
        await readFile(firstEvidencePath, "utf8"),
        await readFile(secondEvidencePath, "utf8"),
      ].join("\n");
      assert.doesNotMatch(rendered, /sk-test-project|pk-test-project/);
      assert.doesNotMatch(rendered, /You are the Intentive Companion/);
      assert.doesNotMatch(rendered, /A deliberately specific sentence that must remain temporary/);
    } finally {
      await fake.close();
    }
  },
);

test(
  "--apply fails when read-back verification disagrees and leaves content-free failure evidence",
  { timeout: 20_000 },
  async () => {
    const fake = await createFakeLangfuse({
      corruptPromptOnVerification: true,
      seededPrompts: productionPrompts(),
    });
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "intentive-langfuse-failure-"));
    const evidencePath = path.join(tempDirectory, "failure.json");
    const env = {
      ...withoutLangfuseCredentials(process.env),
      LANGFUSE_PUBLIC_KEY: "pk-test-project",
      LANGFUSE_SECRET_KEY: "sk-test-project",
      LANGFUSE_BASE_URL: fake.baseUrl,
    };

    try {
      const result = await runTool(["--apply", "--evidence", evidencePath], env);
      assert.equal(result.status, 1);
      assert.deepEqual(JSON.parse(result.stderr), {
        error: "verification_failed",
        message: "The Langfuse production Procedure Floor prompt was unavailable.",
      });
      assert.equal(result.stdout, "");

      const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
      assert.deepEqual(evidence, {
        schema_version: 1,
        mode: "apply",
        status: "failed",
        remote_mutation: true,
        error: "verification_failed",
        verification: {
          performed: true,
          passed: false,
        },
      });
      assert.doesNotMatch(JSON.stringify(evidence), /sk-test-project|You are the Intentive/);
    } finally {
      await fake.close();
    }
  },
);

test(
  "--apply fails closed when a required production prompt is unavailable",
  { timeout: 20_000 },
  async () => {
    const fake = await createFakeLangfuse();
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "intentive-langfuse-conflict-"));
    const evidencePath = path.join(tempDirectory, "conflict.json");
    const env = {
      ...withoutLangfuseCredentials(process.env),
      LANGFUSE_PUBLIC_KEY: "pk-test-project",
      LANGFUSE_SECRET_KEY: "sk-test-project",
      LANGFUSE_BASE_URL: fake.baseUrl,
    };

    try {
      const result = await runTool(["--apply", "--evidence", evidencePath], env);
      assert.equal(result.status, 1);
      assert.deepEqual(JSON.parse(result.stderr), {
        error: "prompt_unavailable",
        message: "Required Langfuse production prompt is unavailable: intentive-runtime-bundle.",
      });
      assert.equal(fake.writeCount, 0);
      assert.equal(JSON.parse(await readFile(evidencePath, "utf8")).remote_mutation, false);
    } finally {
      await fake.close();
    }
  },
);

function productionPrompts() {
  return {
    "intentive-runtime-bundle": {
      name: "intentive-runtime-bundle",
      type: "text",
      prompt: "production bundle body",
      labels: ["production"],
      version: 4,
    },
  };
}

function runTool(arguments_, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...arguments_], {
      cwd: serviceRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stderr, stdout }));
  });
}

async function createFakeLangfuse(options = {}) {
  const prompts = new Map(Object.entries(options.seededPrompts ?? {}));
  const datasets = new Map();
  const items = new Map();
  const promptReads = new Map();
  let writeCount = 0;
  const expectedAuthorization = `Basic ${Buffer.from(
    "pk-test-project:sk-test-project",
    "utf8",
  ).toString("base64")}`;

  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== expectedAuthorization) {
      return json(response, 401, { message: "unauthorized" });
    }

    const url = new URL(request.url, "http://127.0.0.1");
    const promptPrefix = "/api/public/v2/prompts/";
    const datasetPrefix = "/api/public/v2/datasets/";
    const itemPrefix = "/api/public/dataset-items/";

    if (request.method === "GET" && url.pathname.startsWith(promptPrefix)) {
      const name = decodeURIComponent(url.pathname.slice(promptPrefix.length));
      const prompt = prompts.get(name);
      const readCount = (promptReads.get(name) ?? 0) + 1;
      promptReads.set(name, readCount);
      if (prompt && options.corruptPromptOnVerification && readCount >= 2) {
        return json(response, 200, { ...prompt, prompt: "" });
      }
      return prompt
        ? json(response, 200, prompt)
        : json(response, 404, { message: "prompt not found" });
    }

    if (request.method === "POST" && url.pathname === "/api/public/v2/prompts") {
      const body = await readJsonBody(request);
      writeCount += 1;
      const prompt = {
        ...body,
        version: (prompts.get(body.name)?.version ?? 0) + 1,
      };
      prompts.set(body.name, prompt);
      return json(response, 200, prompt);
    }

    if (request.method === "GET" && url.pathname.startsWith(datasetPrefix)) {
      const name = decodeURIComponent(url.pathname.slice(datasetPrefix.length));
      const dataset = datasets.get(name);
      return dataset
        ? json(response, 200, dataset)
        : json(response, 404, { message: "dataset not found" });
    }

    if (request.method === "POST" && url.pathname === "/api/public/v2/datasets") {
      const body = await readJsonBody(request);
      writeCount += 1;
      const dataset = { ...body, id: `dataset-${datasets.size + 1}` };
      datasets.set(body.name, dataset);
      return json(response, 200, dataset);
    }

    if (request.method === "GET" && url.pathname.startsWith(itemPrefix)) {
      const id = decodeURIComponent(url.pathname.slice(itemPrefix.length));
      const item = items.get(id);
      return item ? json(response, 200, item) : json(response, 404, { message: "item not found" });
    }

    if (request.method === "POST" && url.pathname === "/api/public/dataset-items") {
      const body = await readJsonBody(request);
      writeCount += 1;
      items.set(body.id, body);
      return json(response, 200, body);
    }

    return json(response, 404, { message: "route not found" });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    get writeCount() {
      return writeCount;
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.once("error", reject);
    request.once("end", () => resolve(JSON.parse(body)));
  });
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function withoutLangfuseCredentials(source) {
  const env = { ...source };
  for (const key of [
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
    "LANGFUSE_BASE_URL",
    "LANGFUSE_HOST",
  ]) {
    delete env[key];
  }
  return env;
}
