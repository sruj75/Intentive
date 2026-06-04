// RN component test runner (the `test:rn` script). Split from the pure-core
// node:test path by axis: jest only picks up `*.rn.test.tsx` so it never runs
// the `.mjs` resolver tests, and node:test never loads React Native.
const expoPreset = require("jest-expo/jest-preset");

// `@assistant-ui/*` and `assistant-stream` ship ESM-only and live under a nested
// `node_modules/@assistant-ui/...` segment (pnpm), which jest-expo's default
// transformIgnorePatterns excludes from Babel. Whitelist them so the Chat
// Primitive Engine (#22) is transformed like react-native/expo are. Derived
// from the preset's first pattern so it survives preset updates.
const [pnpmPattern, ...restPatterns] = expoPreset.transformIgnorePatterns;

module.exports = {
  preset: "jest-expo",
  testMatch: ["**/test/**/*.rn.test.tsx"],
  transformIgnorePatterns: [
    pnpmPattern.replace("(.pnpm|", "(.pnpm|@assistant-ui|assistant-stream|nanoid|"),
    ...restPatterns,
  ],
  // `@assistant-ui/core` eagerly requires its cloud thread-history adapter,
  // which imports the (uninstalled, unused) `assistant-cloud` integration.
  // Stub it — the Intentive path uses the local runtime, not assistant cloud.
  // Same stub Metro aliases (see metro.config.js) so both paths behave alike.
  moduleNameMapper: {
    "^assistant-cloud$": "<rootDir>/assistant-cloud-stub.js",
  },
};
