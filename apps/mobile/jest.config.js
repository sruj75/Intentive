// RN component test runner (the `test:rn` script). Split from the pure-core
// node:test path by axis: jest only picks up `*.rn.test.tsx` so it never runs
// the `.mjs` resolver tests, and node:test never loads React Native.
//
// The `test:rn` script runs jest with `--forceExit` (see package.json). That is
// not masking a leak in our code: `@assistant-ui/tap`'s reactive scheduler —
// pulled in transitively by `@assistant-ui/react-native` (companion-chat.tsx) —
// creates a single module-scoped `MessageChannel` at import time and uses it as
// its macrotask queue. It is a private singleton with no teardown API, and its
// port must stay ref'd (it carries the scheduler's `onmessage` listener) for the
// store→React flush to work, so no test-level cleanup or `unref` can release it.
// `--detectOpenHandles` confirms it as the lone open handle (a ref'd MESSAGEPORT).
// Without `--forceExit`, Jest hangs indefinitely after every test passes
// ("Jest did not exit one second after the test run has completed") — a CI
// footgun. `--forceExit` lets the process return promptly once the suite is done.
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
