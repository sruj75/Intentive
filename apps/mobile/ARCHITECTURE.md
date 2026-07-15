# Mobile Client Architecture

## Current composition

The Mobile Client currently mounts one scene-driven Expo experience. It is a real frontend chassis with local interaction behavior and replaceable visuals, but intentionally has no production electronics behind it.

```text
Expo Router root
      │
      ▼
ExperienceProvider ── owns one LocalExperienceController per cold launch
      │
      ▼
ExperienceApp
      ├── auth
      ├── name (+ validation variant)
      ├── friends intro
      ├── permissions intro
      ├── education deck (five states)
      └── chat
           ├── welcome mode (E)
           ├── ready mode (K/L)
           ├── drawer overlay (F)
           └── settings overlay (G)
```

E and K are deliberately one `chat` scene. Education changes `chatMode` from `welcome` to `ready`; it does not navigate to a second chat implementation.

## Deep frontend module

`src/experience/controller.ts` hides scene transitions, name validation, overlays, session settings, education navigation, composer state, deterministic response timing, reset, and cleanup behind:

```ts
interface ExperienceController {
  getSnapshot(): ExperienceSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(event: ExperienceEvent): void;
  dispose(): void;
}
```

Screens know only the immutable snapshot and events. They do not own journey sequencing or timers.

The UI timeline uses `ConversationTimelineItem`, a frontend union for capability cards, suggestion groups, user messages, Companion messages, and activity indicators. Future Protocol or Runtime Adapter data must be translated at an adapter seam into this model; Protocol shapes must not leak into visual components.

## Replaceable layer

- `content.ts` owns authentication copy, intro copy, education definitions, drawer/settings labels, suggestions, capability content, and scripted responses.
- `theme.ts` owns the light iPhone typography, colors, spacing, radii, shadows, and motion values.
- `ui/` owns reusable primitives, scenes, overlays, education, and the shared conversation surface.

Changing Huracán/Genie into Aventador/Intentive should primarily replace the content/theme/media layer and extend adapter inputs, not rewrite controller or scene composition.

## Local behavior boundary

The mounted tree may perform only local, in-memory work:

- validate and normalize a full name;
- transition scenes and overlays;
- update session-only settings;
- populate and submit the composer;
- advance through thinking, composing, and scripted reply phases with cancellable timers.

It must not import or call auth providers, permissions, Contacts, notifications, fetch, WebSocket, SecureStore, persistence, telemetry, Control Plane, or Agent Runtime modules.

## Dormant production adapters

The following existing modules remain source-controlled and tested where their tests are pure, but are unmounted:

- auth services and Neon client;
- launch/account Control Plane sources and projections;
- Protocol Runtime Adapter and development transport;
- message store, conversation reducer, and routing client;
- notification registration modules;
- telemetry provider.

Reconnection will require an explicit adapter translating production state and Runtime events into `ExperienceSnapshot` and `ConversationTimelineItem`. It must preserve the controller/UI boundary and must not revive route-per-gate coupling.

## Test axes

- `node:test`: pure controller and dormant production adapters.
- Jest + React Native Testing Library: complete 390×844 journey, overlays, variants, keyboard/composer behavior, local timers, reset, and zero-call capability assertions.
- Simulator: final visual/gesture/keyboard walkthrough for the reference states.

The final mechanical gate is `pnpm harness --scope apps/mobile`.
