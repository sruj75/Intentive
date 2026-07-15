// RN component tests stay separate from the pure node:test adapter suite.
const expoPreset = require("jest-expo/jest-preset");

const [pnpmPattern, ...restPatterns] = expoPreset.transformIgnorePatterns;

module.exports = {
  preset: "jest-expo",
  testMatch: ["**/test/**/*.rn.test.tsx"],
  setupFilesAfterEnv: ["<rootDir>/jest/jest-setup.js"],
  testTimeout: 30_000,
  transformIgnorePatterns: [
    // Workspace packages ship ESM dist and must be transformed for Jest.
    pnpmPattern.replace("(.pnpm|", "(.pnpm|@intentive|"),
    ...restPatterns,
  ],
  moduleNameMapper: {
    "^react-native-reanimated$": "<rootDir>/jest/reanimated-mock.js",
    // Pure modules use explicit `.js` extensions for their emitted ESM build.
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
