# assistant-ui/native as Chat Primitive Engine

Intentive will spike `assistant-ui/native` for MVP 1 as a replaceable Chat Primitive Engine, not as the app shell or visual design system. The decision optimizes for speed on thread, message, composer, streaming, retry, and backend-adapter mechanics while keeping Intentive's Liquid Glass shell, message visuals, onboarding, account surfaces, runtime adapter, and persistence boundaries owned locally.

**Considered Options**

- Build all chat primitives directly from Expo and React Native components.
- Adopt `assistant-ui/native` examples as the app's chat UI.
- Use `assistant-ui/native` behind Intentive Chat Components as replaceable infrastructure.

**Consequences**

- Local components should wrap assistant primitives so the package can be removed if it fights the product.
- The spike must prove full customization of message rows, the floating Liquid Glass Composer, custom runtime/backend adapter integration, loading/error/streaming states, and future nonstandard event rendering.
- Vendor-provided ChatGPT-like visuals should not define the Intentive product identity.
- If the spike fails the customization or adapter tests, the app should eject early and build custom primitives.

## Spike Outcome (#22)

**Recommendation: KEEP.** The spike landed a minimal Intentive Chat Components wrapper (`src/domains/chat/ui/companion-chat.tsx`) over `@assistant-ui/react-native@0.1.20`, backed by a canned dev adapter (`src/domains/chat/runtime/dev-chat-adapter.ts`). Every exit criterion was met behind a one-line interface (`<CompanionChat adapter?/>`), and the vendor import stayed confined to the `chat` domain — the route renders `<CompanionChat/>` and never sees a vendor type. The package earns its place as replaceable infrastructure; nothing surfaced that warrants ejecting to hand-built primitives for MVP 1.

Each criterion below is proven by a test in `apps/mobile/test/companion-chat.rn.test.tsx` (RN harness) or `apps/mobile/test/dev-chat-adapter.test.mjs` (Node), exercised through the wrapper's rendered output — the dev adapter is the only boundary, so nothing internal is mocked.

| Exit criterion                             | Result                                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full customization of message rows         | **Pass**                                  | User/assistant rows are local components via `ThreadPrimitive.Messages` `components={{ UserMessage, AssistantMessage }}` + `MessagePrimitive.Content renderText`; tests assert Intentive-owned `testID`s carry the text, no vendor chrome.                                                                                                                                                                                                                                                                                                                                                |
| Floating Liquid Glass Composer             | **Pass (slot proven)**                    | The stock footer is fully replaced by an Intentive `Composer` (`ComposerPrimitive.Root/Input/Send`). Plain visuals only — the floating Liquid Glass presentation, safe-area, and keyboard handling are **#45**. The spike proves the slot is override-able, not the final look.                                                                                                                                                                                                                                                                                                           |
| Custom runtime/backend adapter integration | **Pass**                                  | `CompanionChat` accepts a vendor `ChatModelAdapter` (dependency injection), defaulting to the dev adapter. This is the exact seam **#33** swaps for the Protocol-backed adapter; the canned-reply test proves the slot is wired.                                                                                                                                                                                                                                                                                                                                                          |
| Loading / error / streaming states         | **Pass**                                  | Streaming: the adapter yields cumulative text frames, rendered incrementally. Loading: a local `ThreadPrimitive.If running` surface shows then clears. Error/retry: an error-**status** result drives `ErrorPrimitive` + `ActionBarPrimitive.Reload`, and retry re-invokes the adapter (asserted `calls === 2`).                                                                                                                                                                                                                                                                          |
| Nonstandard event rendering                | **Pass (mechanism confirmed, not built)** | `MessagePrimitive.Content` exposes per-part renderers: `renderText`, `renderToolCall`, `renderImage`, `renderReasoning`, `renderSource`, `renderFile`, and `renderData`. Plus `makeAssistantTool` / `useAssistantTool` / `ToolUI` for registering tool-call UI. Intentive's structured agent outputs (session boundaries, exercises, agent-state cards) map to `renderToolCall` / `useAssistantTool` (interactive/structured) or the generic `data` part via `renderData` (typed payload escape hatch). No production rendering built here — that follows the Protocol shapes in **#33**. |

### Adapter error contract (a finding for #33)

The local runtime records a thrown adapter error on the message **and re-throws**, rejecting the run promise (an unhandled rejection in tests). The dev adapter therefore signals failure by **yielding an error-status frame** — `{ status: { type: "incomplete", reason: "error", error } }` — which drives the same `ErrorPrimitive` + retry UI without the side effect. **#33's Protocol adapter should follow this contract**: surface delivery/stream failures as an error-status result, not a thrown exception. Abort is handled symmetrically — the generator checks `abortSignal.aborted` and returns cleanly, so a mid-stream unmount never surfaces as an unhandled rejection.

### Test-harness findings (so #33/#45 don't re-derive them)

The vendor package ships native ESM and pulled in a few rough edges under the jest-expo harness. The fixes are **surgical and scoped to the test env** — a global module transform was tried first and rejected because it breaks React Native's own component specs (strategic over tactical: the harness was fine; only a handful of ESM packages needed compiling). Mechanisms now in place:

- **Scoped Babel override** (`apps/mobile/babel.config.js`): under `NODE_ENV=test` only, `@babel/plugin-transform-modules-commonjs` is applied via `overrides` matching only `@assistant-ui` / `assistant-stream` / `nanoid` node_modules paths. Metro/Expo keep native ESM.
- **`transformIgnorePatterns` whitelist** (`apps/mobile/jest.config.js`): those same ESM packages are removed from jest-expo's default ignore so Babel transforms them.
- **`assistant-cloud` stub** (`apps/mobile/test/stubs/assistant-cloud.js` + `moduleNameMapper`): `@assistant-ui/core`'s barrel eagerly requires its cloud thread-history adapter, which imports the uninstalled, unused `assistant-cloud` integration. The Intentive path uses the local runtime, so it is stubbed.
- **Macrotask-flush test helper**: the assistant-ui store (zustand-based) notifies React on a macrotask tick, so tests flush a `setTimeout` between typing and pressing send — otherwise the composer's `canSend` has not yet reflected the typed text and the press no-ops. Standard async-UI test hygiene, documented inline in the test.

`pnpm test:rn` exits 0 with all suites green; jest prints a benign "a worker process has failed to exit gracefully and has been force exited" warning from a timer the vendor runtime/store leaves running. The script was deliberately **not** given `--forceExit` — jest's own worker force-exit already handles it and the suite exits clean, so adding the flag would mask the signal without fixing anything. If a future change makes the leak fatal, chase the leaked timer (`--detectOpenHandles`) rather than papering over it.

### Out of scope (confirmed deferred)

- Liquid Glass visuals, floating composer, safe-area / keyboard avoidance, Dynamic Type → **#45**.
- Protocol shapes, `GET /agent` routing, real streaming/delivery/Agent State semantics, durable message store → **#33**.
- Whether to wrap the vendor `ChatModelAdapter` behind an Intentive-owned adapter interface (vs. injecting the vendor type directly, as the spike does) → **#33**.
