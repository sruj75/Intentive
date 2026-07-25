// Expo Babel config. The SDK preset includes Expo Router and Worklets support.
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
