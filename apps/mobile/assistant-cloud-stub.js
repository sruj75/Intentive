// Shared no-op stub for the optional `assistant-cloud` package (#22 spike).
//
// `@assistant-ui/core`'s barrel eagerly requires its cloud thread-history
// adapter, which imports `assistant-cloud` — a cloud-persistence integration
// the Intentive local-runtime path never uses (Conversation History is
// server-truth via the Agent Runtime, not assistant-ui cloud). The package is
// not installed, so the bare specifier must be aliased to this stub in BOTH
// build paths: Metro (so `<CompanionChat/>` bundles for the app) via
// `metro.config.js`, and jest (so the RN tests load `@assistant-ui/core`) via
// `jest.config.js` `moduleNameMapper`. Exports are accessed only via
// destructuring at module load and are never constructed.
module.exports = new Proxy(
  {},
  {
    get: () => function AssistantCloudStub() {},
  },
);
