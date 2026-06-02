// Expo Babel config (CommonJS — the package root is not `type: module`).
// `babel-preset-expo` includes the expo-router transform for SDK 56.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
