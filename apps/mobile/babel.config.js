// Expo Babel config (CommonJS — the package root is not `type: module`).
// `babel-preset-expo` includes the expo-router transform for SDK 56.
//
// Under jest (`NODE_ENV=test`) we additionally compile the Chat Primitive
// Engine's ESM-only packages (`@assistant-ui/*`, `assistant-stream`, `nanoid`)
// to CommonJS, because jest's runtime is CJS and those ship native ESM. The
// transform is SCOPED via `overrides` to only those node_modules paths: a
// GLOBAL module transform fights `@react-native/babel-preset` and breaks React
// Native's own component specs. Metro/Expo keep native ESM (better
// tree-shaking) since this only applies in the test env. The cache key tracks
// NODE_ENV so the two environments never share a compiled result.
module.exports = function (api) {
  api.cache.using(() => process.env.NODE_ENV);
  const isTest = process.env.NODE_ENV === "test";
  return {
    presets: ["babel-preset-expo"],
    overrides: isTest
      ? [
          {
            test: /[/\\]node_modules[/\\].*(@assistant-ui|assistant-stream|nanoid)[/\\]/,
            plugins: ["@babel/plugin-transform-modules-commonjs"],
          },
        ]
      : [],
  };
};
