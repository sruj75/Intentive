# Mobile Client — Agent Guide

iPhone-first Expo frontend for the Intentive Mobile Client. Read this file, the root [`AGENTS.md`](../../AGENTS.md), [`CONTEXT.md`](CONTEXT.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), and [`docs/DESIGN.md`](docs/DESIGN.md) before changing the mounted experience.

## Current phase

The mounted app is the **Huracán frontend foundation**: a Genie-inspired, locally simulated A-to-L journey used to approve frontend architecture and UX before Intentive-specific content and production wiring return.

- Expo Router is only the composition root (`app/_layout.tsx` + `app/index.tsx`).
- `src/experience/` owns the visible application.
- No mounted screen may call auth, Contacts, notification permissions, HTTP, WebSockets, SecureStore, durable storage, telemetry, or the Agent Runtime.
- Stable backend-facing modules under `src/domains/` and `src/providers/` are parked, not deleted. Do not reconnect them without an approved integration plan.

## Experience invariants

- Cold launch always constructs a fresh controller at A (`auth`).
- E and K are states of the same `chat` scene: `chatMode: "welcome"` and `chatMode: "ready"`.
- B2 is validation state, F/G are overlays, K2 is keyboard state, and L1-L4 are conversation phases—not routes.
- Content and theme decisions belong in `src/experience/content.ts` and `src/experience/theme.ts`, not scattered through components.
- UI renders `ConversationTimelineItem`, never Protocol event shapes.
- Tasks, Messages, Friends, attachment, microphone, profile-add, and Add Friends capability controls remain visibly disabled.
- Local timers must be cancellable on reset, logout, replacement turn, and controller disposal.

## Structure

```text
app/                         Router composition only
src/experience/
  types.ts                   UI model and controller contract
  content.ts                 Replaceable Genie-facing manifest
  theme.ts                   Replaceable light iPhone tokens
  controller.ts              Pure local scenario engine
  ui/                        Scene, overlay, composer, and visual components
src/domains/                 Dormant production domain modules
src/providers/               Dormant production provider modules
test/experience-*            Controller and mounted journey tests
```

Use React Native primitives, Reanimated, Gesture Handler, `react-native-safe-area-context`, and Expo-compatible packages. Keep files kebab-case and reusable code outside `app/`.

## Verify

```bash
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile test
pnpm --dir apps/mobile test:rn
pnpm harness --scope apps/mobile
```

The React Native journey is accepted at 390×844 and should stay responsive across iPhone sizes. It must keep explicit zero-call assertions for backend and native capability boundaries.
