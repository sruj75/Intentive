#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  buildFindingId,
  dependencyId,
  highFanInId,
  staleScaffoldId,
  untestedExportId,
  vocabularyId,
} from "./finding-ids.mjs";

const scaffoldId = staleScaffoldId("apps/mobile/src/domains/chat/types/scaffold.ts");
assert.equal(scaffoldId, "stale-scaffold:apps/mobile/src/domains/chat/types/scaffold.ts");

const movedLineVocabId = vocabularyId(
  "apps/mobile/app/index.tsx",
  "Launch Destination",
  "Companion Home",
);
assert.equal(
  movedLineVocabId,
  "vocabulary:apps/mobile/app/index.tsx:launch-destination:companion-home",
);

const exportA = untestedExportId("packages/protocol/src/events.ts", "SessionMessage");
const exportB = untestedExportId("packages/protocol/src/events.ts", "OtherMessage");
assert.notEqual(exportA, exportB);

const sameExport = untestedExportId("packages/protocol/src/events.ts", "SessionMessage");
assert.equal(exportA, sameExport);

const fanIn = highFanInId("packages/protocol/src/index.ts");
assert.equal(fanIn, "high-fan-in:packages/protocol/src/index.ts");

const dep = dependencyId("apps/mobile", "@intentive/protocol");
assert.equal(dep, "dependency:apps/mobile:intentive-protocol");

const custom = buildFindingId("boundary-import", [
  "services/agent-runtime/src/index.ts",
  "apps/mobile/src/index.ts",
]);
assert.equal(
  custom,
  "boundary-import:services/agent-runtime/src/index.ts:apps/mobile/src/index.ts",
);

console.log("factory finding-ids: fixture test passed");
