import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const easJson = JSON.parse(await readFile(new URL("../eas.json", import.meta.url), "utf8"));
const rootDevelopmentDoc = await readFile(
  new URL("../../../docs/DEVELOPMENT.md", import.meta.url),
  "utf8",
);

test("the mobile inner loop explicitly targets an Expo Development Client", () => {
  assert.match(packageJson.scripts.dev, /\bexpo start\b/);
  assert.match(packageJson.scripts.dev, /--dev-client\b/);
});

test("the EAS simulator profile builds the configured development client", () => {
  assert.equal(easJson.build.development.developmentClient, true);
  assert.equal(easJson.build.development.environment, "preview");
  assert.equal(easJson.build["development-simulator"].extends, "development");
  assert.equal(easJson.build["development-simulator"].ios.simulator, true);
});

test("the root local-stack workflow points Metro at the local Control Plane", () => {
  assert.match(
    rootDevelopmentDoc,
    /env:exec preview \\\n\s+"EXPO_PUBLIC_CONTROL_PLANE_BASE_URL=http:\/\/localhost:8080 pnpm dev"/,
  );
});
