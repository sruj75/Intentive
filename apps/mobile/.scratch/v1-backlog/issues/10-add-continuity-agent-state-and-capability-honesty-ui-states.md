# Add Continuity, Agent State, and Capability-Honesty UI States

Status: open
Labels: ready-for-agent
Opened: 2026-05-22T12:15:57Z
Updated: 2026-05-23T07:19:36Z

## Description

## Parent

#1

## What to build

Add subtle **Agent State**, lightweight continuity events, contextual warnings, and capability-honest UI language to Companion Chat. The Mobile Surface should make remote companion activity legible without implying the client or companion acted unless the Runtime Adapter or Control Plane reported it.

When a user skipped macOS Setup, Companion Chat may later surface a contextual **Sibling Client Invitation** only when the current conversation exposes a concrete reason Mac context would help. This is not a repeated onboarding gate and must not turn chat into a setup dashboard.

## Acceptance criteria

- [ ] Agent State renders at least Available, Thinking, Following up, and Paused.
- [ ] Continuity events can appear lightly inside Companion Chat without becoming a memory dashboard.
- [ ] Missing or disconnected macOS Client can produce contextual warnings only when it affects the current experience.
- [ ] A contextual Sibling Client Invitation can appear after an earlier skip only when runtime/control-plane state reports a concrete relevant capability gap.
- [ ] Contextual invitation copy explains the immediate value of Mac context without implying access already exists.
- [ ] Contextual invitation behavior does not re-create a blocking Pre-Chat Gate or repeatedly interrupt ordinary chat.
- [ ] UI copy avoids implying the companion read, acted, scheduled, or connected anything unless runtime/control-plane state says so.
- [ ] Future nonstandard event rendering has a local component path.
- [ ] Tests cover Agent State rendering, continuity event rendering, contextual warnings, contextual invitation visibility/suppression, and capability-honest copy states.

## Blocked by

- #7
- #8
- #9


## Comments

(No comments.)
