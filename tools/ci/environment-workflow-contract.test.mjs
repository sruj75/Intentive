#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repoUrl = new URL("../../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, repoUrl), "utf8");
}

async function json(path) {
  return JSON.parse(await text(path));
}

test("Mobile Preview is a standalone internal build with the production app identity", async () => {
  const app = await json("apps/mobile/app.json");
  const eas = await json("apps/mobile/eas.json");
  const preview = eas.build.preview;

  assert.equal(app.expo.ios.bundleIdentifier, "com.heyintentive.expo");
  assert.equal(preview.distribution, "internal");
  assert.equal(preview.channel, "preview");
  assert.equal(preview.environment, "preview");
  assert.notEqual(preview.developmentClient, true);
});

test("Desktop Preview has a dedicated publish and install path", async () => {
  const packageJson = await json("apps/desktop/package.json");
  const publishSource = await text("apps/desktop/macos/scripts/publish-preview.sh");
  const installSource = await text("apps/desktop/macos/scripts/install-preview.sh");
  const runtimeSource = await text(
    "apps/desktop/macos/Desktop/Sources/Intentive/MainWindowView.swift",
  );

  assert.equal(packageJson.scripts["preview:publish"], "bash macos/scripts/publish-preview.sh");
  assert.equal(packageJson.scripts["preview:install"], "bash macos/scripts/install-preview.sh");
  assert.match(publishSource, /Intentive Preview/);
  assert.match(publishSource, /com\.heyintentive\.desktop\.preview/);
  assert.match(publishSource, /intentive-desktop-preview/);
  assert.match(publishSource, /git .*status --porcelain/);
  assert.match(publishSource, /sign_update/);
  assert.match(publishSource, /gh release create/);
  assert.match(publishSource, /--prerelease/);
  assert.doesNotMatch(publishSource, /\bhdiutil\b/);
  assert.doesNotMatch(publishSource, /\bnotarytool\b/);
  assert.match(installSource, /com\.heyintentive\.desktop\.preview/);
  assert.match(installSource, /TeamIdentifier/);
  assert.match(runtimeSource, /com\.heyintentive\.desktop\.preview/);
  assert.match(runtimeSource, /CFBundleURLTypes/);
});

test("Desktop distribution signs the login launcher inside-out without capture entitlements", async () => {
  const releaseWorkflow = await text(".github/workflows/desktop-release.yml");
  const previewPublisher = await text("apps/desktop/macos/scripts/publish-preview.sh");
  const n1Driver = await text("apps/desktop/macos/scripts/stage2/sparkle-n1-update-driver.sh");
  const tartBuilder = await text("apps/desktop/macos/scripts/tart-internal-build.sh");
  const bundleVerifier = await text("apps/desktop/macos/scripts/verify-app-bundle.sh");

  for (const source of [releaseWorkflow, previewPublisher, n1Driver]) {
    assert.match(source, /Contents\/MacOS\/IntentiveLoginLauncher/);
    assert.doesNotMatch(
      source,
      /codesign --force --options runtime --timestamp --deep \\\n\s+--entitlements/,
    );
    assert.match(source, /codesign --force --options runtime --timestamp \\\n\s+--entitlements/);
    assert.match(source, /codesign --verify --deep --strict/);
  }

  assert.match(tartBuilder, /Contents\/MacOS\/IntentiveLoginLauncher/);
  assert.doesNotMatch(tartBuilder, /codesign --force --deep[^\n]*"\$app_bundle"\s*$/m);
  assert.match(tartBuilder, /codesign --verify --deep --strict/);

  assert.match(bundleVerifier, /ProgramArguments:0/);
  assert.match(bundleVerifier, /RunAtLoad/);
  assert.match(bundleVerifier, /TeamIdentifier/);
  assert.match(bundleVerifier, /Runtime Version/);
  assert.match(bundleVerifier, /login launcher must not carry entitlements/i);
});

test("Desktop login launch uses a fresh service identity and retires only its legacy item", async () => {
  const bundleBuilder = await text("apps/desktop/macos/scripts/build-app-bundle.sh");
  const bundleVerifier = await text("apps/desktop/macos/scripts/verify-app-bundle.sh");
  const previewPublisher = await text("apps/desktop/macos/scripts/publish-preview.sh");
  const nativeRegistrar = await text(
    "apps/desktop/macos/Desktop/Sources/Intentive/DesktopPermissionAdapters.swift",
  );
  const loginLauncher = await text(
    "apps/desktop/macos/Desktop/Sources/IntentiveLoginLauncher/IntentiveLoginLauncher.swift",
  );

  for (const source of [bundleBuilder, bundleVerifier]) {
    assert.match(source, /login-launcher-v1[.]plist/);
    assert.match(source, /com[.]heyintentive[.]desktop[.]login[.]plist/);
  }
  assert.match(previewPublisher, /com[.]heyintentive[.]desktop[.]preview[.]login-launcher-v1/);
  assert.match(nativeRegistrar, /retireLegacyRegistration/);
  assert.doesNotMatch(loginLauncher, /--refresh-login-registration/);
  assert.doesNotMatch(
    [bundleBuilder, bundleVerifier, previewPublisher, nativeRegistrar, loginLauncher].join("\n"),
    /(?:^|\n)\s*sfltool\s+resetbtm/m,
  );
});

test("clean Tart first-launch validation remains a Development workflow", async () => {
  const tartSource = await text("apps/desktop/macos/scripts/tart-internal-build.sh");
  const development = await text("docs/DEVELOPMENT.md");
  const preview = await text("docs/PREVIEW.md");

  assert.doesNotMatch(tartSource, /INTENTIVE_INTERNAL_PREVIEW/);
  assert.match(development, /disposable Tart clone/i);
  assert.doesNotMatch(preview, /internal:run|TART_HOME/);
});

test("Development database branches cover both backend schemas and clean themselves up", async () => {
  const workflow = await text(".github/workflows/neon-development-branches.yml");

  assert.match(workflow, /services\/control-plane\/\*\*/);
  assert.match(workflow, /services\/agent-runtime\/\*\*/);
  assert.match(workflow, /development\/pr-/);
  assert.match(workflow, /services\/control-plane migrate/);
  assert.match(workflow, /services\/agent-runtime migrate/);
  assert.match(workflow, /delete-branch-action/);
  assert.match(workflow, /if: always\(\)/);
});

test("Preview means founder dogfooding against the real production system", async () => {
  const preview = await text("docs/PREVIEW.md");

  assert.match(preview, /real authentication/i);
  assert.match(preview, /production Control Plane/i);
  assert.match(preview, /production Agent Runtime/i);
  assert.match(preview, /production Neon/i);
  assert.match(preview, /same Sentry and PostHog projects/i);
  assert.match(preview, /temporary pre-launch/i);
  assert.doesNotMatch(preview, /isolated Control Plane/i);
  assert.doesNotMatch(preview, /preview database/i);
});

test("Agent Runtime deploy keeps Desktop coaching default-off and founder-scoped", async () => {
  const workflow = await text(".github/workflows/agent-runtime-deploy.yml");
  const envExample = await text("services/agent-runtime/.env.example");
  const release = await text("services/agent-runtime/docs/RELEASE.md");

  assert.match(
    workflow,
    /DESKTOP_COACHING_V1_ENABLED=\$\{\{ vars\.DESKTOP_COACHING_V1_ENABLED \|\| 'false' \}\}/,
  );
  assert.match(
    workflow,
    /DESKTOP_COACHING_V1_FOUNDER_USER_IDS=\$\{\{ vars\.DESKTOP_COACHING_V1_FOUNDER_USER_IDS \}\}/,
  );
  assert.match(envExample, /^DESKTOP_COACHING_V1_ENABLED=false$/m);
  assert.match(envExample, /^DESKTOP_COACHING_V1_FOUNDER_USER_IDS=$/m);
  assert.match(release, /schema-only\s+`migrations\/0013_desktop_coaching_windows\.sql`/i);
  assert.match(release, /feature.*disabled/i);
  assert.match(release, /founder\s+allowlist/i);
  assert.match(release, /scrub-perception-ledger\.mjs/);
});
