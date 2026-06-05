#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const parser = require("@typescript-eslint/parser");

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const ignoredDirectories = new Set([
  ".git",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);
const ignoredPathFragments = ["/reference/"];
const scannedRoots = ["apps", "services"];

const usage = `Intentive contract drift sensor

Hard-gates deployable source against local redefinitions of shared wire/HTTP
contracts. Import canonical schemas and types from the shared packages instead.

Usage:
  pnpm sensor:contract-drift
  node tools/sensors/contract-drift/index.mjs [--repo <path>]

Options:
  --repo <path>  Repository root to analyze. Defaults to the current directory.
  --help         Show this help.
`;

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    process.exit(0);
  }

  const report = analyzeContractDrift(options);
  if (report.findings.length > 0) {
    console.error(formatReport(report));
    process.exit(1);
  }

  console.log("Contract Drift Sensor: no drift found.");
} catch (error) {
  console.error(`contract-drift: ${error.message}`);
  process.exit(1);
}

export function analyzeContractDrift({ repo = process.cwd() } = {}) {
  const repoRoot = path.resolve(repo);
  const protocol = loadProtocolContract(repoRoot);
  const apiContract = loadApiContract(repoRoot);
  const sourceFiles = listDeployableSourceFiles(repoRoot);
  const findings = [];

  for (const relPath of sourceFiles) {
    const code = readFileSync(path.join(repoRoot, relPath), "utf8");
    const ast = parseSource(code, relPath);
    const imports = collectPackageImports(ast);

    findings.push(
      ...findProtocolDrift({ ast, relPath, imports, protocol }),
      ...findApiContractDrift({ ast, relPath, imports, apiContract }),
    );
  }

  return {
    repoRoot,
    sourceFiles,
    findings: findings.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name)),
  };
}

function parseArgs(args) {
  const options = { repo: process.cwd(), help: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--repo") {
      options.repo = requireValue(args, index, arg);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(args, index, arg) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}

function loadProtocolContract(repoRoot) {
  const relPath = "packages/protocol/src/index.ts";
  const ast = parseSource(readFileSync(path.join(repoRoot, relPath), "utf8"), relPath);
  const events = new Map();

  visit(ast, (node) => {
    if (node.type !== "VariableDeclarator" || !node.id || node.id.type !== "Identifier") return;
    const objectCall = unwrapZodObjectCall(node.init);
    if (!objectCall) return;

    const eventName = getTypeLiteralFromZodObject(objectCall);
    if (eventName) {
      events.set(eventName, {
        eventName,
        schemaName: node.id.name,
        typeName: snakeToPascal(node.id.name),
      });
    }
  });

  return { events };
}

function loadApiContract(repoRoot) {
  const schemas = new Map();
  for (const relPath of [
    "packages/api-contract/src/public.ts",
    "packages/api-contract/src/internal.ts",
  ]) {
    const ast = parseSource(readFileSync(path.join(repoRoot, relPath), "utf8"), relPath);
    visit(ast, (node) => {
      if (node.type !== "VariableDeclarator" || !node.id || node.id.type !== "Identifier") return;
      if (!isRequestOrResponseName(node.id.name)) return;

      const objectCall = unwrapZodObjectCall(node.init);
      const fields = objectCall ? getZodObjectKeys(objectCall) : [];
      schemas.set(node.id.name, { name: node.id.name, fields });
    });
  }

  return { schemas };
}

function listDeployableSourceFiles(repoRoot) {
  const files = [];
  for (const root of scannedRoots) {
    const absRoot = path.join(repoRoot, root);
    if (!exists(absRoot)) continue;

    for (const workspace of readdirSync(absRoot).sort()) {
      const absSrc = path.join(absRoot, workspace, "src");
      if (exists(absSrc)) {
        walk(absSrc, repoRoot, files);
      }
    }
  }
  return files.sort();
}

function walk(absDir, repoRoot, files) {
  for (const entry of readdirSync(absDir).sort()) {
    const absPath = path.join(absDir, entry);
    const relPath = toRepoPath(repoRoot, absPath);
    const stat = statSync(absPath);

    if (stat.isDirectory()) {
      if (ignoredDirectories.has(entry) || isIgnoredPath(relPath)) continue;
      walk(absPath, repoRoot, files);
      continue;
    }

    if (stat.isFile() && sourceExtensions.has(path.extname(absPath)) && !isIgnoredPath(relPath)) {
      files.push(relPath);
    }
  }
}

function findProtocolDrift({ ast, relPath, imports, protocol }) {
  const findings = [];

  visit(ast, (node) => {
    if (node.type === "VariableDeclarator") {
      const objectCall = unwrapZodObjectCall(node.init);
      if (objectCall) {
        const eventName = getTypeLiteralFromZodObject(objectCall);
        if (
          eventName &&
          protocol.events.has(eventName) &&
          !importsProtocolEvent(imports, protocol, eventName)
        ) {
          findings.push(protocolFinding(relPath, eventName, node));
        }
      }

      const unionEvents = getDiscriminatedUnionEvents(node.init);
      for (const eventName of unionEvents) {
        if (protocol.events.has(eventName) && !importsProtocolEvent(imports, protocol, eventName)) {
          findings.push(protocolFinding(relPath, eventName, node));
        }
      }
    }

    if (node.type === "ObjectExpression") {
      const eventName = getObjectStringProperty(node, "type");
      if (
        eventName &&
        protocol.events.has(eventName) &&
        !importsProtocolEvent(imports, protocol, eventName)
      ) {
        findings.push(protocolFinding(relPath, eventName, node));
      }
    }
  });

  return uniqueFindings(findings);
}

function findApiContractDrift({ ast, relPath, imports, apiContract }) {
  const findings = [];

  visit(ast, (node) => {
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") {
      const schema = apiContract.schemas.get(node.id.name);
      if (schema && isZodSchemaExpression(node.init) && !imports.apiContract.has(node.id.name)) {
        findings.push(apiFinding(relPath, node.id.name, node));
      }
    }

    if (node.type === "ObjectExpression") {
      const keys = getObjectExpressionKeys(node);
      for (const schema of apiContract.schemas.values()) {
        if (
          schema.fields.length > 0 &&
          sameSet(keys, schema.fields) &&
          !imports.apiContract.has(schema.name)
        ) {
          findings.push(apiFinding(relPath, schema.name, node));
        }
      }
    }
  });

  return uniqueFindings(findings);
}

function collectPackageImports(ast) {
  const protocol = new Set();
  const apiContract = new Set();

  visit(ast, (node) => {
    if (node.type !== "ImportDeclaration" || !isStringLiteral(node.source)) return;
    const target =
      node.source.value === "@intentive/protocol"
        ? protocol
        : node.source.value === "@intentive/api-contract"
          ? apiContract
          : null;
    if (!target) return;

    for (const specifier of node.specifiers ?? []) {
      if (specifier.type === "ImportSpecifier") {
        target.add(specifier.imported.name ?? specifier.imported.value);
      } else if (specifier.type === "ImportNamespaceSpecifier") {
        target.add("*");
      }
    }
  });

  return {
    protocol: expandNamespaceImport(protocol),
    apiContract: expandNamespaceImport(apiContract),
  };
}

function expandNamespaceImport(imports) {
  if (!imports.has("*")) return imports;
  return {
    has() {
      return true;
    },
  };
}

function importsProtocolEvent(imports, protocol, eventName) {
  const event = protocol.events.get(eventName);
  if (!event) return false;
  return (
    imports.protocol.has(event.eventName) ||
    imports.protocol.has(event.schemaName) ||
    imports.protocol.has(event.typeName) ||
    imports.protocol.has("ClientToRuntimeEvent") ||
    imports.protocol.has("RuntimeToClientEvent")
  );
}

function protocolFinding(file, eventName, node) {
  return {
    kind: "protocol",
    file,
    line: node.loc?.start?.line ?? 1,
    name: eventName,
    message: "Import from @intentive/protocol; do not redefine this wire shape locally.",
  };
}

function apiFinding(file, schemaName, node) {
  return {
    kind: "api-contract",
    file,
    line: node.loc?.start?.line ?? 1,
    name: schemaName,
    message: "Import from @intentive/api-contract; do not redefine this HTTP contract locally.",
  };
}

function formatReport(report) {
  const lines = ["Contract Drift Sensor: drift found.", ""];

  for (const finding of report.findings) {
    lines.push(
      `- ${finding.file}:${finding.line} ${finding.name}: ${finding.message}`,
      `  Suggested import package: ${
        finding.kind === "protocol" ? "@intentive/protocol" : "@intentive/api-contract"
      }`,
    );
  }

  return lines.join("\n");
}

function parseSource(code, relPath) {
  try {
    return parser.parse(code, {
      comment: false,
      ecmaFeatures: { jsx: relPath.endsWith(".tsx") || relPath.endsWith(".jsx") },
      ecmaVersion: "latest",
      loc: true,
      sourceType: "module",
    });
  } catch (error) {
    throw new Error(`failed to parse ${relPath}: ${error.message}`);
  }
}

function isZodSchemaExpression(node) {
  return Boolean(unwrapZodObjectCall(node) || getDiscriminatedUnionEvents(node).length > 0);
}

function unwrapZodObjectCall(node) {
  if (!node) return null;
  if (isZodObjectCall(node)) return node;
  if (node.type === "CallExpression" && isMemberName(node.callee, "strict")) {
    return unwrapZodObjectCall(node.callee.object);
  }
  return null;
}

function isZodObjectCall(node) {
  return (
    node?.type === "CallExpression" &&
    isMemberName(node.callee, "object") &&
    node.callee.object?.type === "Identifier" &&
    node.callee.object.name === "z"
  );
}

function getTypeLiteralFromZodObject(objectCall) {
  const shape = objectCall.arguments?.[0];
  if (shape?.type !== "ObjectExpression") return null;

  for (const property of shape.properties) {
    if (property.type !== "Property" || getPropertyKey(property) !== "type") continue;
    return getZodLiteralValue(property.value);
  }

  return null;
}

function getZodObjectKeys(objectCall) {
  const shape = objectCall.arguments?.[0];
  if (shape?.type !== "ObjectExpression") return [];
  return shape.properties
    .filter((property) => property.type === "Property")
    .map(getPropertyKey)
    .filter(Boolean)
    .sort();
}

function getDiscriminatedUnionEvents(node) {
  if (
    node?.type !== "CallExpression" ||
    !isMemberName(node.callee, "discriminatedUnion") ||
    node.callee.object?.type !== "Identifier" ||
    node.callee.object.name !== "z"
  ) {
    return [];
  }

  const discriminator = node.arguments?.[0];
  const entries = node.arguments?.[1];
  if (!isStringLiteral(discriminator) || discriminator.value !== "type") return [];
  if (entries?.type !== "ArrayExpression") return [];

  return entries.elements
    .map((element) => (element?.type === "Literal" ? element.value : null))
    .filter((value) => typeof value === "string");
}

function getObjectStringProperty(node, keyName) {
  for (const property of node.properties ?? []) {
    if (property.type !== "Property" || getPropertyKey(property) !== keyName) continue;
    if (isStringLiteral(property.value)) return property.value.value;
  }
  return null;
}

function getObjectExpressionKeys(node) {
  return (node.properties ?? [])
    .filter((property) => property.type === "Property")
    .map(getPropertyKey)
    .filter(Boolean)
    .sort();
}

function getZodLiteralValue(node) {
  if (
    node?.type === "CallExpression" &&
    isMemberName(node.callee, "literal") &&
    node.callee.object?.type === "Identifier" &&
    node.callee.object.name === "z" &&
    isStringLiteral(node.arguments?.[0])
  ) {
    return node.arguments[0].value;
  }
  return null;
}

function isMemberName(node, name) {
  return node?.type === "MemberExpression" && !node.computed && node.property?.name === name;
}

function getPropertyKey(property) {
  if (property.key.type === "Identifier") return property.key.name;
  if (isStringLiteral(property.key)) return property.key.value;
  return null;
}

function isStringLiteral(node) {
  return node?.type === "Literal" && typeof node.value === "string";
}

function isRequestOrResponseName(name) {
  return /(?:Request|Response)$/.test(name);
}

function snakeToPascal(value) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function sameSet(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function uniqueFindings(findings) {
  const seen = new Set();
  const unique = [];
  for (const finding of findings) {
    const key = `${finding.kind}:${finding.file}:${finding.line}:${finding.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(finding);
  }
  return unique;
}

function visit(node, fn) {
  if (!node || typeof node !== "object") return;
  fn(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, fn);
    } else if (value && typeof value === "object" && typeof value.type === "string") {
      visit(value, fn);
    }
  }
}

function exists(absPath) {
  try {
    statSync(absPath);
    return true;
  } catch {
    return false;
  }
}

function isIgnoredPath(relPath) {
  const normalized = `/${relPath.replace(/\\/g, "/")}`;
  return ignoredPathFragments.some((fragment) => normalized.includes(fragment));
}

function toRepoPath(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).replace(/\\/g, "/");
}
