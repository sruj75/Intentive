# Intentive Expo Architecture

## Bird's-eye Overview

Intentive Expo is an iOS-first Expo Client App for the Intentive Execution Companion. It is the Mobile Surface, not the Agent Runtime, Control Plane, provisioning layer, or productivity dashboard.

The app owns native onboarding, the Liquid Glass Chat Shell, Intentive Chat Components, local conversation persistence, account/setup recovery surfaces, and the client-side Runtime Adapter. Shared identity, onboarding continuity, routing, backend persistence, provisioning coordination, and the Deep Agent live behind the Control Plane.

The V1 product spine is:

Launch state -> Identity Gate -> Consent Primer -> macOS Setup -> Relationship Onboarding in chat -> Liquid Glass Companion Chat -> Account Surface for utility and recovery.

V1 optimizes for one calm continuous chat, visible companion state, capability honesty, and replaceable infrastructure. It must not grow into tabs, dashboards, task boards, streaks, or a local agent runtime.

Software design score: 8.5/10. The product boundaries are strong; reaching 10/10 requires a concrete source layout, enforceable import boundaries, and explicit provider interfaces before implementation starts.

## Codemap

Planned root shape:

- `app/`: Expo Router routes only. No reusable components live here.
- `src/domains/chat/`: Companion Chat domain, structured messages, chat service, Runtime Adapter usage, and chat UI.
- `src/domains/onboarding/`: launch-state resolution, Identity Gate, Consent Primer, macOS Setup, and Relationship Onboarding flow.
- `src/domains/account/`: Account Surface, logout, setup recovery, connection status, and debug status.
- `src/providers/`: explicit provider interfaces and implementations for auth, Control Plane API, runtime transport, local storage, platform capabilities, telemetry, and notifications.
- `src/design/`: design tokens from `DESIGN.md`, theme helpers, and appearance resolution.
- `src/dev-companion/`: MVP-only development companion implementing the same Runtime Adapter contract as production.
- `src/testing/`: contract fixtures and test helpers shared across domains.
- `docs/adr/`: architectural decisions. New architecture changes get ADRs before they change product boundaries.

Domain-internal layer order:

Types -> Config -> Repo -> Service -> Runtime -> UI

Each business domain may use those layers, but should not create all of them unless the layer hides real complexity. Shallow files are worse than fewer deeper modules.

Primary deep modules:

- `Runtime Adapter`: hides Control Plane/runtime transport, streaming, retry, assistant state, and future follow-up events behind one client contract.
- `Conversation Store`: hides local persistence details behind structured `Conversation Message` operations.
- `Intentive Chat Components`: hide `assistant-ui/native` or any future chat primitive engine behind local product components.
- `Launch State Resolver`: hides auth/session/consent/setup branching behind one state machine.
- `Design Theme`: hides light/dark token resolution and platform appearance details.

## Architectural Invariants

The Expo app never talks directly to the Deep Agent. All production runtime interaction goes through the Control Plane via the Runtime Adapter.

The Expo app never owns durable shared identity, provisioning, backend persistence, or long-running autonomy. Those belong behind Control Plane contracts.

The first real relationship-forming conversation happens only after Identity Gate and Consent Primer.

macOS Setup happens before Relationship Onboarding, but is only fully blocking when runtime capability flags say mobile chat cannot work meaningfully without the sibling client.

Companion Chat is the V1 home. No bottom tabs, primary dashboard, task board, streak system, calendar shell, or conventional productivity frame.

The Account Surface is utility, not primary navigation. It is opened through a visible but quiet Account Affordance.

`assistant-ui/native` is replaceable infrastructure. Vendor visuals, route shape, persistence model, or backend assumptions must not leak into product components.

Conversation history is stored as structured `Conversation Message` records with stable IDs, roles, timestamps, delivery status, and runtime metadata. No transcript blobs.

Notification permission is contextual. The app must not request it during initial launch.

Agent State must be capability-honest. The UI must not imply the companion read, acted, scheduled, or connected anything unless the Control Plane/runtime actually did.

## Boundaries

`app/` may import route screens only. Route files compose domain UI but do not contain business logic, persistence, runtime calls, or reusable components.

UI code may call Services or Runtime facades, not provider implementations directly.

Repo code owns persistence details. UI and Services must not know whether chat storage is SQLite, AsyncStorage, secure storage, or backend sync.

Runtime code owns transport details. Chat UI must not know whether the assistant response comes from Dev Companion, Control Plane streaming, or a future runtime protocol.

Providers are the only approved path to cross-cutting systems: auth, Control Plane API, storage, notifications, telemetry, platform APIs, and feature flags.

`assistant-ui/native` may appear only inside the Chat Primitive Engine wrapper layer. If imports spread into routes or unrelated domains, the dependency is leaking.

Design tokens come from `DESIGN.md` through `src/design/`. Components should consume semantic theme values, not hard-code product colors.

Control Plane API DTOs should be translated at the boundary into app domain types. Backend wire format must not become the app's internal model.

## Cross-cutting Concerns

Testing should assert user-visible behavior and contracts, not vendor internals or style object details.

Required contract tests:

- Launch state resolver: signed out, missing consent, missing macOS setup, relationship onboarding ready, main app ready.
- Runtime Adapter: send, stream, error, retry, expose Agent State.
- Conversation Store: create, append, update delivery status, preserve timestamps, reload history.
- Chat Components: custom user/assistant rows, streaming, loading, error, retry.
- Composer layout: keyboard safety, safe area, scroll inset correctness.
- Permission behavior: no notification prompt before contextual reason.

Mechanical checks should be added once code exists:

- Layer import check for `Types -> Config -> Repo -> Service -> Runtime -> UI`.
- Provider-only access check for auth, storage, runtime, telemetry, and notifications.
- Ban reusable components under `app/`.
- Ban direct `assistant-ui/native` imports outside the chat primitive wrapper.
- Ban direct Deep Agent or provisioning imports from client code.
- Accessibility and contrast checks for light and dark chat surfaces.

Design complexity rule: when a new feature needs shared knowledge in multiple places, first ask whether a deeper module should own that knowledge. Prefer one deep boundary over several shallow wrappers.
