"use strict";

const path = require("path");

const CROSS_CUTTING_SDKS = {
  "@sentry/node": {
    concern: "observability",
    owningBoundary: "packages/providers/src/observability",
    preferredImport: "@intentive/providers/observability",
    exampleFix:
      "replace the direct '@sentry/node' import with 'bootstrapObservability' or an injected logger from '@intentive/providers/observability'.",
    allowedPath(pathname) {
      return isProvidersObservabilityPath(pathname);
    },
  },
  "@sentry/react-native": {
    concern: "observability",
    owningBoundary: "apps/mobile/src/providers/telemetry",
    preferredImport: "apps/mobile/src/providers/telemetry",
    exampleFix:
      "inject the Telemetry port from 'src/providers/telemetry' instead of importing '@sentry/react-native' in domain or route code.",
    allowedPath(pathname) {
      return isMobileTelemetryProviderPath(pathname);
    },
  },
  "langfuse-langchain": {
    concern: "Langfuse tracing",
    owningBoundary: "packages/providers/src/observability",
    preferredImport: "@intentive/providers/observability",
    exampleFix:
      "create Langfuse callback handlers through 'createLangfuseCallbackHandlerFactory' from '@intentive/providers/observability'.",
    allowedPath(pathname, node) {
      return (
        isProvidersObservabilityPath(pathname) ||
        isAgentRuntimePromptClientException(pathname, node)
      );
    },
  },
};

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require cross-cutting SDKs to enter deployables through @intentive/providers or a deployable providers/ seam.",
      recommended: true,
    },
    messages: {
      directSdkImport:
        "Rule violated: provider-only-cross-cutting. Direct '{{sdk}}' imports for {{concern}} are not allowed here. " +
        "Owning boundary: {{owningBoundary}}. " +
        "Preferred import path: {{preferredImport}} or this deployable's providers/ re-export. " +
        "Example fix: {{exampleFix}}",
    },
    schema: [],
  },
  create(context) {
    const filename = context.physicalFilename || context.filename;
    if (!filename) return {};
    const normalizedFilename = normalizePath(filename);

    function checkImport(node, specifier) {
      if (typeof specifier !== "string") return;
      if (specifier.startsWith("@intentive/providers")) return;

      const policy = CROSS_CUTTING_SDKS[specifier];
      if (!policy) return;
      if (policy.allowedPath(normalizedFilename, node)) return;

      context.report({
        node,
        messageId: "directSdkImport",
        data: {
          sdk: specifier,
          concern: policy.concern,
          owningBoundary: policy.owningBoundary,
          preferredImport: policy.preferredImport,
          exampleFix: policy.exampleFix,
        },
      });
    }

    return {
      ImportDeclaration(node) {
        checkImport(node, node.source && node.source.value);
      },
      ImportExpression(node) {
        if (node.source && node.source.type === "Literal") {
          checkImport(node, node.source.value);
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments.length === 1 &&
          node.arguments[0].type === "Literal"
        ) {
          checkImport(node, node.arguments[0].value);
        }
      },
    };
  },
};

function normalizePath(filepath) {
  return path.resolve(filepath).replace(/\\/g, "/");
}

function isProvidersObservabilityPath(filepath) {
  return /\/packages\/providers\/src\/observability(?:\/|$)/.test(filepath);
}

function isMobileTelemetryProviderPath(filepath) {
  return /\/apps\/mobile\/src\/providers\/telemetry(?:\/|$)/.test(filepath);
}

function isAgentRuntimePromptClientException(filepath, node) {
  if (!/\/services\/agent-runtime\/src\/main\.ts$/.test(filepath)) return false;
  if (!node || node.type !== "ImportDeclaration") return false;

  return node.specifiers.every(
    (specifier) =>
      specifier.type === "ImportSpecifier" &&
      specifier.imported &&
      specifier.imported.name === "Langfuse",
  );
}
