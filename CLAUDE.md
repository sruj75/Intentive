# Agent Instructions

Intentive Expo is the mobile relationship surface for the Intentive Execution Companion: an iOS-first Expo client for authentication, consent, setup, and one continuous companion chat.

## Start Here

- Read `CONTEXT.md` for domain language before naming modules, screens, or concepts.
- Read `PRD.md` for current V1 scope, user stories, implementation decisions, and testing expectations.
- Read `DESIGN.md` before changing UI, tokens, navigation, chat layout, or visual copy.
- Read relevant ADRs in `docs/adr/` before changing architecture boundaries or product scope.

## Current Repository Shape

- This repo is documentation-first right now; there is no committed Expo app scaffold or package manager config yet.
- `ios/` and `android/` currently contain app icon assets only.
- Treat `docs/adr/` as the durable record of architectural decisions.
- If implementation begins, keep route files under `app/` and reusable source under `src/`.

## Architectural Guardrails

- The Expo app is a Client App and Mobile Surface, not the Agent Runtime, Control Plane, provisioning layer, or Deep Agent.
- Production client-to-agent communication must go through the Control Plane via a Runtime Adapter.
- Keep `assistant-ui/native` replaceable: wrap it behind Intentive Chat Components and do not let vendor visuals or data shapes define the product.
- Persist chat as structured Conversation Messages, not transcript blobs.
- Preserve the V1 shell decision: one Liquid Glass Companion Chat, no header-first frame, no bottom tabs, no dashboard, no task board, no streaks.
- Keep Identity Gate, Consent Primer, macOS Setup, Relationship Onboarding, Main App, and Account Surface as distinct product states.
- Defer notification permission until a contextual Held Intention or Follow-Up creates a reason.

## Design And Product Language

- Use the product terms from `CONTEXT.md`: Execution Companion, Mobile Surface, Control Plane, Runtime Adapter, Conversation Store, Companion Chat, Liquid Glass Composer, Account Surface, Held Intention.
- Avoid generic terms that blur boundaries, such as chatbot, task bot, mobile backend, in-app agent, or transcript blob.
- Capability honesty matters: never imply the companion read, acted, scheduled, or connected something unless the remote runtime or Control Plane actually did.

## Documentation Practice

- Keep root instructions short. Put durable product and architecture detail in `CONTEXT.md`, `PRD.md`, `DESIGN.md`, and `docs/adr/`.
- Add or update an ADR when changing a boundary, dependency stance, runtime assumption, persistence model, or major product-scope decision.
- When `AGENTS.md` changes, make the same change to `CLAUDE.md` so both files remain identical.
