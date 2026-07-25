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
  printf 'sparkle_feed=%s\\n' "$INTENTIVE_SPARKLE_FEED_URL"
  printf 'sparkle_key=%s\\n' "$INTENTIVE_SPARKLE_PUBLIC_ED_KEY"
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
  printf 'sparkle_feed=%s\\n' "$INTENTIVE_SPARKLE_FEED_URL"
  printf 'sparkle_key=%s\\n' "$INTENTIVE_SPARKLE_PUBLIC_ED_KEY"
} > "$TEST_VERIFY_LOG"
`,
  );

  const development = run({
    INTENTIVE_CONTROL_PLANE_URL: "http://127.0.0.1:8080",
    INTENTIVE_HOSTED_AUTH_URL: "https://auth.development.example.com/sign-in",
    INTENTIVE_AUTH_TOKEN_EXCHANGE_URL: "https://auth.development.example.com/desktop/token",
    INTENTIVE_SPARKLE_FEED_URL: "https://updates.example.com/appcast.xml",
    INTENTIVE_SPARKLE_PUBLIC_ED_KEY: "must-not-enter-development-bundle",
  });
  assert.equal(development.status, 0, development.stderr);
  assert.equal(development.stdout.trim(), artifact);
  assert.equal(
    await readFile(buildLog, "utf8"),
    [
      "bundle=com.heyintentive.desktop.dev",
      "control=http://127.0.0.1:8080",
      "auth=https://auth.development.example.com/sign-in",
      "exchange=https://auth.development.example.com/desktop/token",
      "sparkle_feed=",
      "sparkle_key=",
      "",
    ].join("\n"),
  );
  assert.equal(
    await readFile(verifyLog, "utf8"),
    [
      "arg1=--app",
      `arg2=${artifact}`,
      "bundle=com.heyintentive.desktop.dev",
      "control=http://127.0.0.1:8080",
      "auth=https://auth.development.example.com/sign-in",
      "exchange=https://auth.development.example.com/desktop/token",
      "sparkle_feed=",
      "sparkle_key=",
      "",
    ].join("\n"),
  );

  const daily = run({});
  assert.equal(daily.status, 0, daily.stderr);
  assert.match(await readFile(verifyLog, "utf8"), /bundle=com\.heyintentive\.desktop\.dev/);
  assert.match(
    await readFile(verifyLog, "utf8"),
    /control=\nauth=\nexchange=\nsparkle_feed=\nsparkle_key=\n$/,
  );

  console.log("Development Tart build contracts passed.");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
