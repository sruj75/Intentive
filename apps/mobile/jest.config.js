// RN component test runner (the `test:rn` script). Split from the pure-core
// node:test path by axis: jest only picks up `*.rn.test.tsx` so it never runs
// the `.mjs` resolver tests, and node:test never loads React Native.
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/test/**/*.rn.test.tsx"],
};
