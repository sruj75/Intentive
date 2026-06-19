import assert from "node:assert/strict";
import test from "node:test";

import { resolveExpoProjectId } from "../dist/domains/notifications/config/expo-project-id.js";

test("resolveExpoProjectId prefers app config EAS project ID", () => {
  const projectId = resolveExpoProjectId({
    expoConfig: { extra: { eas: { projectId: "from-extra" } } },
    easConfig: { projectId: "from-eas-config" },
  });

  assert.equal(projectId, "from-extra");
});

test("resolveExpoProjectId falls back to Constants.easConfig project ID", () => {
  const projectId = resolveExpoProjectId({
    easConfig: { projectId: "from-eas-config" },
  });

  assert.equal(projectId, "from-eas-config");
});

test("resolveExpoProjectId returns undefined when no project ID is available", () => {
  assert.equal(resolveExpoProjectId({}), undefined);
});
