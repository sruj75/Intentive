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
