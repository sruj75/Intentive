"use strict";

const layerDirection = require("./lib/rules/layer-direction");
const noCrossDeployable = require("./lib/rules/no-cross-deployable");
const contextVocabulary = require("./lib/rules/context-vocabulary");
const filenameCase = require("./lib/rules/filename-case");
const providerOnlyCrossCutting = require("./lib/rules/provider-only-cross-cutting");

const plugin = {
  meta: {
    name: "@intentive/eslint-plugin-architecture",
    version: "0.0.1",
  },
  rules: {
    "layer-direction": layerDirection,
    "no-cross-deployable": noCrossDeployable,
    "context-vocabulary": contextVocabulary,
    "filename-case": filenameCase,
    "provider-only-cross-cutting": providerOnlyCrossCutting,
  },
};

// Recommended preset — wire up all rules at `error` severity.
plugin.configs = {
  recommended: {
    plugins: { "intentive-architecture": plugin },
    rules: {
      "intentive-architecture/layer-direction": "error",
      "intentive-architecture/no-cross-deployable": "error",
      "intentive-architecture/context-vocabulary": "error",
      "intentive-architecture/filename-case": "error",
      "intentive-architecture/provider-only-cross-cutting": "error",
    },
  },
};

module.exports = plugin;
