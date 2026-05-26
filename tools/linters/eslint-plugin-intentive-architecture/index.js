'use strict';

const layerDirection = require('./lib/rules/layer-direction');
const noCrossDeployable = require('./lib/rules/no-cross-deployable');

const plugin = {
  meta: {
    name: '@intentive/eslint-plugin-architecture',
    version: '0.0.1',
  },
  rules: {
    'layer-direction': layerDirection,
    'no-cross-deployable': noCrossDeployable,
  },
};

// Recommended preset — wire up both rules at `error` severity.
plugin.configs = {
  recommended: {
    plugins: { 'intentive-architecture': plugin },
    rules: {
      'intentive-architecture/layer-direction': 'error',
      'intentive-architecture/no-cross-deployable': 'error',
    },
  },
};

module.exports = plugin;
