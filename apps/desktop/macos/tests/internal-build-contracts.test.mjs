#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const internalBuildScript = resolve(testDirectory, "../scripts/tart-internal-build.sh");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "intentive-internal-build."));
const fakeBin = join(temporaryDirectory, "bin");
const artifact = join(temporaryDirectory, "output with spaces", "Intentive Dev.app");
const buildLog = join(temporaryDirectory, "build.log");
const verifyLog = join(temporaryDirectory, "verify.log");
const builder = join(temporaryDirectory, "build-app.sh");
const verifier = join(temporaryDirectory, "verify-app.sh");
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("INTENTIVE_")),
);

async function executable(path, source) {
  await writeFile(path, source);
  await chmod(path, 0o755);
}

function run(environment) {
  return spawnSync("bash", [internalBuildScript, "--build"], {
    encoding: "utf8",
    env: {
      ...inheritedEnvironment,
      PATH: `${fakeBin}:${process.env.PATH}`,
      INTENTIVE_INTERNAL_BUILD_SCRIPT: builder,
      INTENTIVE_INTERNAL_VERIFY_SCRIPT: verifier,
      INTENTIVE_INTERNAL_SIGNING_IDENTITY: "-",
      TEST_ARTIFACT: artifact,
      TEST_BUILD_LOG: buildLog,
      TEST_VERIFY_LOG: verifyLog,
      ...environment,
    },
  });
}

try {
  await mkdir(fakeBin);
  await executable(join(fakeBin, "uname"), "#!/bin/sh\nprintf 'arm64\\n'\n");
  await executable(join(fakeBin, "codesign"), "#!/bin/sh\nexit 0\n");
  await executable(
    builder,
    `#!/bin/sh
set -eu
mkdir -p "$TEST_ARTIFACT"
{
  printf 'bundle=%s\\n' "$INTENTIVE_BUNDLE_ID"
  printf 'control=%s\\n' "$INTENTIVE_CONTROL_PLANE_URL"
  printf 'auth=%s\\n' "$INTENTIVE_HOSTED_AUTH_URL"
  printf 'exchange=%s\\n' "$INTENTIVE_AUTH_TOKEN_EXCHANGE_URL"
} > "$TEST_BUILD_LOG"
printf '%s\\n' "$TEST_ARTIFACT"
`,
  );
  await executable(
    verifier,
    `#!/bin/sh
set -eu
{
  printf 'arg1=%s\\n' "$1"
  printf 'arg2=%s\\n' "$2"
  printf 'bundle=%s\\n' "$INTENTIVE_BUNDLE_ID"
  printf 'control=%s\\n' "$INTENTIVE_CONTROL_PLANE_URL"
  printf 'auth=%s\\n' "$INTENTIVE_HOSTED_AUTH_URL"
  printf 'exchange=%s\\n' "$INTENTIVE_AUTH_TOKEN_EXCHANGE_URL"
} > "$TEST_VERIFY_LOG"
`,
  );

  const preview = run({
    INTENTIVE_INTERNAL_PREVIEW: "1",
    INTENTIVE_CONTROL_PLANE_URL: "https://control.preview.example.com",
    INTENTIVE_HOSTED_AUTH_URL: "https://auth.preview.example.com/sign-in",
    INTENTIVE_AUTH_TOKEN_EXCHANGE_URL: "https://auth.preview.example.com/desktop/token",
  });
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(preview.stdout.trim(), artifact);
  assert.equal(
    await readFile(buildLog, "utf8"),
    [
      "bundle=com.heyintentive.desktop.dev",
      "control=https://control.preview.example.com",
      "auth=https://auth.preview.example.com/sign-in",
      "exchange=https://auth.preview.example.com/desktop/token",
      "",
    ].join("\n"),
  );
  assert.equal(
    await readFile(verifyLog, "utf8"),
    [
      "arg1=--app",
      `arg2=${artifact}`,
      "bundle=com.heyintentive.desktop.dev",
      "control=https://control.preview.example.com",
      "auth=https://auth.preview.example.com/sign-in",
      "exchange=https://auth.preview.example.com/desktop/token",
      "",
    ].join("\n"),
  );

  await rm(buildLog, { force: true });
  await rm(verifyLog, { force: true });
  const missingPreviewAuth = run({
    INTENTIVE_INTERNAL_PREVIEW: "1",
    INTENTIVE_CONTROL_PLANE_URL: "https://control.preview.example.com",
  });
  assert.notEqual(missingPreviewAuth.status, 0);
  assert.match(
    missingPreviewAuth.stderr,
    /INTENTIVE_HOSTED_AUTH_URL is required for a preview build/,
  );
  await assert.rejects(readFile(buildLog, "utf8"));
  await assert.rejects(readFile(verifyLog, "utf8"));

  const previewWithSparkle = run({
    INTENTIVE_INTERNAL_PREVIEW: "1",
    INTENTIVE_CONTROL_PLANE_URL: "https://control.preview.example.com",
    INTENTIVE_HOSTED_AUTH_URL: "https://auth.preview.example.com/sign-in",
    INTENTIVE_SPARKLE_FEED_URL: "https://updates.example.com/appcast.xml",
  });
  assert.notEqual(previewWithSparkle.status, 0);
  assert.match(previewWithSparkle.stderr, /must not embed Sparkle feed or signing metadata/);

  const daily = run({});
  assert.equal(daily.status, 0, daily.stderr);
  assert.match(await readFile(verifyLog, "utf8"), /bundle=com\.heyintentive\.desktop\.dev/);
  assert.match(await readFile(verifyLog, "utf8"), /control=\nauth=\nexchange=\n$/);

  console.log("Internal build contracts passed.");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
