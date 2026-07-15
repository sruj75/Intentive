---
version: huracan-foundation
name: Intentive Mobile Client
description: Genie-inspired light iPhone frontend foundation with replaceable content and theme.
---

# Huracán frontend design guide

## Purpose

This phase reproduces the structural DNA of the supplied Genie journey without embedding Genie screenshots or coupling the UI to production systems. The result should feel like a coherent real application at 390×844 and scale across iPhone sizes.

The future Intentive redesign should be able to replace the visible bodywork—brand, copy, media, color, and capability content—while retaining the chassis: scene ownership, overlays, education deck, conversation surface, composer behavior, and local/controller seams.

## Product structure

- A: authentication presentation.
- B/B2: full-name input and validation state.
- C: friends education intro.
- D: proactive permissions intro, with no system prompt.
- E: the shared chat surface in `welcome` mode.
- F: drawer overlay.
- G: settings overlay.
- Education: five configurable scenes.
- K/K2: the same chat surface in `ready` mode, with keyboard variant.
- L1-L4: user sent, thinking, composing, and replied phases.

E and K must never become separate chat components or routes.

## Visual language

Light appearance is intentional for this phase:

- white canvas and quiet gray tonal surfaces;
- black pill actions;
- system sans for functional UI and Georgia only for editorial education titles;
- rounded continuous corners and restrained soft shadows;
- large whitespace, conversational hierarchy, and minimal chrome;
- an abstract orbital mark and neutral media placeholders instead of copied avatar imagery.

All reusable values live in `src/experience/theme.ts`. Do not introduce screen-local brand colors, spacing scales, or motion timings.

## Interaction language

- Buttons and rows provide pressed feedback.
- Scene changes and timeline additions use short Reanimated transitions.
- Education supports Continue, close/skip, and horizontal swipe.
- The drawer dismisses by background tap, home control, or leftward drag.
- The composer uses the software keyboard’s Send action; suggestion rows populate it.
- Disabled capabilities remain visible and expose disabled accessibility state.
- Safe areas and the keyboard are handled through Expo/React Native primitives; layouts use flex and `useWindowDimensions`, never a fixed device height.

## Replaceable content

`src/experience/content.ts` is the single manifest for Genie-facing language, five education definitions, suggestions, disabled capability content, and local replies. New brand work should modify this manifest or introduce typed media slots instead of spreading literals across components.

## Acceptance

Architecture-first fidelity means the supplied references should match in composition, hierarchy, typography roles, spacing rhythm, controls, and state behavior. Pixel-level raster tracing and copied screenshots are explicitly out of scope.
