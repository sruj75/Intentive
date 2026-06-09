#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkAgentDocs } from "./check-agent-docs.mjs";

const repo = mkdtempSync(path.join(tmpdir(), "intentive-agent-docs-"));

try {
  writeFixture();
  let result = await checkAgentDocs({ repoRoot: repo });
  assert.deepEqual(result.failures, []);

  write(
    "AGENTS.md",
    rootAgents({
      includeMobileGuide: false,
      includeMobileDeployable: false,
      includeProtocolPackage: true,
    }),
  );
  result = await checkAgentDocs({ repoRoot: repo });
  assert.match(result.failures.join("\n"), /AGENTS\.md must link to apps\/mobile\/AGENTS\.md/);

  writeFixture();
  write(
    "apps/mobile/AGENTS.md",
    `
# Mobile Client

No backlink here.
`,
  );
  result = await checkAgentDocs({ repoRoot: repo });
  assert.match(result.failures.join("\n"), /apps\/mobile\/AGENTS\.md must link to AGENTS\.md/);

  writeFixture();
  write(
    "apps/mobile/CLAUDE.md",
    `
@AGENTS.md
Extra prose
`,
  );
  result = await checkAgentDocs({ repoRoot: repo });
  assert.match(
    result.failures.join("\n"),
    /apps\/mobile\/CLAUDE\.md must contain exactly one pointer line/,
  );

  writeFixture();
  write(
    "AGENTS.md",
    rootAgents({
      includeMobileGuide: true,
      includeMobileDeployable: false,
      includeProtocolPackage: true,
    }),
  );
  result = await checkAgentDocs({ repoRoot: repo });
  assert.match(result.failures.join("\n"), /root AGENTS\.md deployable table drift/);

  writeFixture();
  write(
    "AGENTS.md",
    rootAgents({
      includeMobileGuide: true,
      includeMobileDeployable: true,
      includeProtocolPackage: false,
    }),
  );
  result = await checkAgentDocs({ repoRoot: repo });
  assert.match(result.failures.join("\n"), /root AGENTS\.md shared package table drift/);

  writeFixture();
  write(
    "AGENTS.md",
    rootAgents({
      includeMobileGuide: true,
      includeMobileDeployable: true,
      includeProtocolPackage: true,
      extraDeployable: "| [services/retired/](services/retired/) | Retired |",
    }),
  );
  result = await checkAgentDocs({ repoRoot: repo });
  assert.match(result.failures.join("\n"), /root AGENTS\.md deployable table drift/);

  console.log("agent-docs: fixture test passed");
} finally {
  rmSync(repo, { recursive: true, force: true });
}

function writeFixture() {
  rmSync(repo, { recursive: true, force: true });
  mkdirSync(repo, { recursive: true });

  write(
    "AGENTS.md",
    rootAgents({
      includeMobileGuide: true,
      includeMobileDeployable: true,
      includeProtocolPackage: true,
    }),
  );
  write("CLAUDE.md", "@AGENTS.md\n");

  writeScopedAgent("apps/mobile/AGENTS.md", "../../AGENTS.md");
  write("apps/mobile/CLAUDE.md", "@AGENTS.md\n");
  writeScopedAgent("apps/desktop/AGENTS.md", "../../AGENTS.md");
  write("apps/desktop/CLAUDE.md", "@AGENTS.md\n");
  writeScopedAgent("services/control-plane/AGENTS.md", "../../AGENTS.md");
  write("services/control-plane/CLAUDE.md", "@AGENTS.md\n");
  writeScopedAgent("services/agent-runtime/AGENTS.md", "../../AGENTS.md");
  write("services/agent-runtime/CLAUDE.md", "@AGENTS.md\n");
  writeScopedAgent("services/agent-runtime/reference/AGENTS.md", "../../../AGENTS.md");
  write("services/agent-runtime/reference/CLAUDE.md", "@AGENTS.md\n");
  writeScopedAgent("packages/AGENTS.md", "../AGENTS.md");
  write("packages/CLAUDE.md", "@AGENTS.md\n");

  write("packages/protocol/package.json", "{}\n");
  write("packages/api-contract/package.json", "{}\n");
  write("packages/domain-types/package.json", "{}\n");
  write("packages/providers/package.json", "{}\n");
}

function rootAgents({
  includeMobileGuide,
  includeMobileDeployable,
  includeProtocolPackage,
  extraDeployable = "",
}) {
  const deployables = [
    includeMobileDeployable
      ? "| [apps/mobile/](apps/mobile/) | [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) |"
      : "",
    "| [apps/desktop/](apps/desktop/) | [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md) |",
    "| [services/control-plane/](services/control-plane/) | [services/control-plane/AGENTS.md](services/control-plane/AGENTS.md) |",
    "| [services/agent-runtime/](services/agent-runtime/) | [services/agent-runtime/AGENTS.md](services/agent-runtime/AGENTS.md) |",
    extraDeployable,
  ]
    .filter(Boolean)
    .join("\n");
  const packages = [
    includeProtocolPackage ? "| [packages/protocol/](packages/protocol/) | Protocol |" : "",
    "| [packages/api-contract/](packages/api-contract/) | API |",
    "| [packages/domain-types/](packages/domain-types/) | Domain |",
    "| [packages/providers/](packages/providers/) | Providers |",
  ]
    .filter(Boolean)
    .join("\n");
  const mobileGuide = includeMobileGuide
    ? "- [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md)\n"
    : "";

  return `
# Intentive — Agent Map

${mobileGuide}- [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md)
- [services/control-plane/AGENTS.md](services/control-plane/AGENTS.md)
- [services/agent-runtime/AGENTS.md](services/agent-runtime/AGENTS.md)
- [packages/AGENTS.md](packages/AGENTS.md)

## The four deployables

| Path | Agent guide |
| ---- | ----------- |
${deployables}

## The shared packages

Working rules: [packages/AGENTS.md](packages/AGENTS.md).

| Path | Owns |
| ---- | ---- |
${packages}
`;
}

function writeScopedAgent(relPath, rootTarget) {
  write(
    relPath,
    `
# Scoped Guide

Read root [AGENTS.md](${rootTarget}).
`,
  );
}

function write(relPath, contents) {
  const absPath = path.join(repo, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, contents.trimStart());
}
