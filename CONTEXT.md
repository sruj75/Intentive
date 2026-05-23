# Intentive Expo App

Intentive Expo is the mobile relationship surface for the Intentive Execution Companion. The app exists to make a proactive agent feel continuous, trustworthy, and easy to return to without turning the experience into a conventional productivity system.

## Language

**Intentive**:
The product experience formed by the mobile app and the remote Execution Companion working together.
_Avoid_: Generic chatbot, productivity app

**Execution Companion**:
The proactive agent that helps the user start, continue, and close important commitments through conversational support.
_Avoid_: Chatbot, task bot, fake-autonomy agent

**Mobile Surface**:
The Expo app that presents the relationship, conversation, agent state, and user controls.
_Avoid_: Agent runtime, backend, dashboard

**Client App**:
A user-facing Intentive application that presents the companion relationship on a specific platform.
_Avoid_: Runtime, control plane, agent

**macOS Client**:
The sibling desktop client where users can also authenticate, onboard, and interact with Intentive.
_Avoid_: Separate product, admin app

**macOS Setup**:
The Expo onboarding step that helps the user install or connect the sibling macOS Client before relationship formation continues.
_Avoid_: Dashboard task, permanent chat card

**Control Plane**:
The shared backend module that owns user identity, onboarding continuity, client-to-agent routing, persistence, and provisioning coordination.
_Avoid_: Thin proxy, mobile backend, Expo server

**Agent Runtime**:
The remote system where the Execution Companion actually runs.
_Avoid_: Expo agent, in-app agent, control plane

**Runtime Adapter**:
The app boundary that sends user messages through the Control Plane and receives assistant responses, state, and follow-up events.
_Avoid_: Chat mock, UI service

**GCP Provisioner**:
The module that provisions cloud infrastructure needed for a user's deep agent runtime.
_Avoid_: Client setup, onboarding screen

**Deep Agent**:
The deployed autonomous agent/runtime instance that executes the user's companion behavior.
_Avoid_: Chat UI, local assistant, control plane

**Conversation Store**:
The app storage boundary that persists structured conversation history for the Mobile Surface.
_Avoid_: Transcript blob, backend assumption

**Conversation Message**:
A structured chat record with stable identity, role, timestamps, delivery status, and runtime metadata.
_Avoid_: Plain string, loose message blob

**Dev Companion**:
A local development stand-in for the Execution Companion used to build and test the Mobile Surface before the real runtime integration is ready.
_Avoid_: Fake product behavior, final agent

**Companion Chat**:
The primary V1 interaction surface: one continuous freeform conversation between the user and the Execution Companion.
_Avoid_: Dashboard, task board, form flow

**Liquid Glass Chat Shell**:
The full-screen iOS app frame that gives Companion Chat primary focus while keeping account and setup utility controls visually quiet.
_Avoid_: Header chrome, bottom-tab app shell, dashboard frame

**Account Surface**:
The minimal utility surface for signed-in identity, logout, client setup status, connection status, app version, support, and recovery.
_Avoid_: Primary navigation tab, productivity dashboard

**Account Affordance**:
The visible but quiet control that opens the Account Surface from the Liquid Glass Chat Shell.
_Avoid_: Header settings button, hidden gesture, bottom navigation item

**Composer**:
The bottom-anchored message input surface for sending text into Companion Chat.
_Avoid_: Form field, command palette, fixed toolbar

**Liquid Glass Composer**:
The floating bottom Composer treatment that blends into the Liquid Glass Chat Shell while staying keyboard-safe and easy to reach.
_Avoid_: Heavy input bar, boxed footer, desktop chat chrome

**Chat Primitive Engine**:
The replaceable library layer that can provide assistant thread, message, composer, streaming, and retry primitives without owning Intentive's product shell.
_Avoid_: Design system, app framework, product identity

**Intentive Chat Components**:
The local components that wrap chat primitives in Intentive-specific Liquid Glass visuals and runtime boundaries.
_Avoid_: Vendor example app, generic ChatGPT clone

**Continuity**:
The product quality that makes the companion feel aware of what mattered before and able to carry that forward.
_Avoid_: Generic history, transcript archive

**Memory**:
Durable context the companion can use to improve future timing, phrasing, and follow-through.
_Avoid_: Settings database, hidden profile dump

**Follow-Up**:
A companion-initiated return to an intention, commitment, or open loop that the user has allowed the system to hold.
_Avoid_: Reminder spam, notification blast

**Proactive Loop**:
The cycle where the companion notices or schedules a return, re-enters gently, helps the user take the next step, and cleans up the loop.
_Avoid_: Nagging, streak mechanic

**Agent State**:
The visible product expression of what the companion is doing or ready to do.
_Avoid_: Loading chrome, bot status only

**Boundary Control**:
A user-facing way to pause, defer, correct, forget, or constrain what the companion holds and initiates.
_Avoid_: Preference maze, privacy afterthought

**Relationship Onboarding**:
The first conversation where the companion learns how to support the user and establishes the first continuity loop.
_Avoid_: Feature tour, setup wizard, preference questionnaire

**Identity Gate**:
The minimal Google OAuth or Apple sign-in step that lets Intentive preserve continuity across sessions, devices, and client apps.
_Avoid_: Account setup journey, onboarding main event

**Consent Primer**:
A brief trust-setting step that explains memory, follow-ups, and user control before the first companion conversation.
_Avoid_: Legal wall, privacy afterthought

**Held Intention**:
The first user-approved intention, commitment, or open loop the companion is allowed to remember and later return to.
_Avoid_: Todo item, reminder task

**Contextual Permission**:
A permission request made only when the user has created a reason for that capability to matter.
_Avoid_: Upfront permission grab, notification prompt on launch

**Follow-Through**:
The outcome of helping the user close the loop they cared about, not merely starting a task.
_Avoid_: Task completion checkbox

## Relationships

- **Intentive** includes multiple **Client Apps**, starting with the Expo **Mobile Surface** and the sibling **macOS Client**.
- The **Mobile Surface** presents **Companion Chat** as the primary visible surface.
- The **Mobile Surface** uses the **Liquid Glass Chat Shell** as its main iOS frame.
- The **Account Surface** is reachable from the **Liquid Glass Chat Shell** through a visible but quiet affordance, not through a header or bottom tab.
- The **Account Surface** owns persistent **macOS Setup** status, logout, and recovery.
- The **Account Affordance** position is TBD until composer, keyboard, and safe-area behavior are designed.
- The **Liquid Glass Composer** sits at the bottom of the **Liquid Glass Chat Shell** and must respect keyboard, safe-area, and reachability behavior.
- The **Chat Primitive Engine** may power thread, message, composer, streaming, and retry mechanics, but **Intentive Chat Components** own the visual shell, message treatment, runtime adapter, onboarding edges, and persistence boundary.
- The **Execution Companion** runs in the **Deep Agent**, not inside any **Client App**.
- The **Mobile Surface** talks to the **Control Plane** through a **Runtime Adapter**.
- The **Control Plane** persists shared identity and backend-backed companion state in Neon Postgres.
- The **Control Plane** coordinates with the **GCP Provisioner** to create or reach the user's **Deep Agent**.
- The **Deep Agent** is the concrete runtime form of the **Agent Runtime**.
- The **Dev Companion** implements the **Runtime Adapter** contract for MVP 1 development only.
- The **Mobile Surface** persists **Conversation Messages** through a **Conversation Store**.
- **Companion Chat** produces **Continuity** by drawing on **Memory** and prior conversation.
- A **Follow-Up** belongs to a **Proactive Loop** and must have a clear reason, permission boundary, and exit condition.
- **Boundary Controls** constrain **Memory** and **Follow-Ups**.
- **Agent State** is how the **Mobile Surface** makes remote companion activity legible.
- The **Identity Gate** happens before **Relationship Onboarding** so continuity is possible from the first real conversation.
- The **Consent Primer** happens before the first **Held Intention** so memory and follow-up feel user-approved rather than mysterious.
- **macOS Setup** happens after the **Consent Primer** and before **Relationship Onboarding**, but remains partially blocking when mobile chat can still work meaningfully without the sibling client connected.
- A **Held Intention** may produce a **Follow-Up** only when the user grants permission for the companion to hold and return to it.
- Notification access is a **Contextual Permission** tied to a specific **Held Intention** or **Follow-Up**, not a launch-time requirement.

## Onboarding

Onboarding should introduce the relationship, not the feature set. V1 should render onboarding as native Expo screens for reliability, speed, and iOS polish, while the **Control Plane** owns durable completion state.

The client sequence is:

1. Launch: resolve auth, session, and setup state.
2. Signed out: show a minimal **Identity Gate** with Google OAuth or Apple sign-in.
3. Consent Primer: show a separate tiny pre-chat trust screen.
4. macOS Setup: guide install or connection before relationship onboarding.
5. Relationship Onboarding: start the first chat-based companion conversation.
6. Main App: land on the chat-first home in the **Liquid Glass Chat Shell**.
7. Settings/Account: provide logout, identity, **macOS Setup** and connection status, app version/debug, support, and recovery through the **Account Surface**.

**macOS Setup** is partially blocking: the app should strongly guide installation or connection before relationship onboarding, but should allow the user to continue when mobile chat can still work meaningfully without the sibling client. After onboarding, **macOS Setup** status belongs in the **Account Surface**; **Companion Chat** should show only contextual warnings when the missing or disconnected macOS Client affects the current experience.

The first useful onboarding artifact is a **Held Intention**: something the user says matters, why it matters, how they want support, and whether the companion may return to it later. Preferences should mostly emerge through conversation instead of through an upfront setup flow.

The app should defer notification permission until the companion can ask in context, such as after the user has allowed a follow-up. This keeps proactivity tied to trust and avoids making the first launch feel like a permission collection funnel.

## Product Scope

**V1: Relational Chat**

V1 is a single-thread companion chat with visible continuity and gentle proactivity. The home screen is the conversation: no dashboard-first experience, no task grid, no streaks, and no productivity-app scaffolding. The app should feel fast to open, emotionally low-friction, and quietly present.

V1 includes:

- One continuous chat thread.
- A lightweight bottom **Liquid Glass Composer**.
- A full-screen **Liquid Glass Chat Shell** with no header and no bottom tabs.
- A visible but quiet **Account Affordance** for the **Account Surface**, location TBD after composer, keyboard, and safe-area behavior are designed.
- A replaceable **Chat Primitive Engine** spike using `assistant-ui/native`, wrapped by **Intentive Chat Components**.
- Assistant responses from the remote Agent Runtime.
- Basic local or backend-backed conversation persistence.
- A small visible expression of agent state, initially limited to Available, Thinking, Following up, and Paused.
- Minimal controls for pausing, deferring, or rejecting follow-ups.
- Early continuity cues such as remembered context or an inline "remembered" event when appropriate.

V1 deliberately delays:

- Dashboards.
- Complex task boards.
- Streaks.
- Multi-agent views.
- Calendar-heavy planning.
- Elaborate onboarding flows.
- A full end-user memory editor.
- Header-based navigation.
- Bottom-tab navigation.
- Deep dependency on a vendor-provided chat visual design.

**V1.5: Proactive Loop**

V1.5 introduces explicit follow-up objects and context-aware check-ins. The companion can return because something mattered, and the UI should make the reason understandable without making the user manage a reminder system.

V1.5 includes:

- Follow-up creation with what, why, when, tone, user permission, and exit condition.
- Gentle re-entry messages.
- Deferral and cancellation.
- Cleanup of stale follow-up residue.
- A clearer boundary model for what the companion may initiate while the app is closed.

**V2: Autonomous Agency**

V2 expands from companion chat into autonomous support. The companion may monitor, plan, coordinate, and act through tools, but every action must remain capability-honest and user-legible.

V2 includes:

- Tool-backed actions.
- Richer proactive monitoring.
- Deeper memory inspection and correction.
- More explicit consent and audit surfaces.
- Coordination across external systems.

## MVP Sequence

**MVP 1: Chat Shell**

Build the single conversation surface, message bubbles, composer, assistant response flow, and basic persistence. MVP 1 may use a **Dev Companion**, but the app code should speak through a **Runtime Adapter** shaped around the real Google Cloud **Agent Runtime**. Conversation persistence should start local on-device through a **Conversation Store**, while **Conversation Messages** remain structured enough for backend sync to replace storage later.

**MVP 2: Continuity**

Use conversation summaries or memory snippets to shape future replies. Keep this mostly hidden, but allow lightweight continuity cues.

**MVP 3: Follow-Up Objects**

Let the companion create and later surface natural-language follow-ups with reason, timing, tone, permission, and exit condition.

**MVP 4: Boundaries**

Let the user say "not now," "pause check-ins," "do not remind me," "forget that," or "change how you check in" without leaving the chat-first experience.

## Example Dialogue

> **Dev:** "Should the app open to a dashboard of tasks and reminders?"
> **Domain expert:** "No. V1 opens to **Companion Chat**. Structure can appear inside the conversation when it helps **Follow-Through**, but the app should not feel like a productivity dashboard."
>
> **Dev:** "Can the Expo app run the autonomous companion directly?"
> **Domain expert:** "No. The **Execution Companion** lives in the **Deep Agent**. The Expo app is one **Client App**, and it reaches the runtime through the **Control Plane**."
>
> **Dev:** "What makes Intentive different from ChatGPT?"
> **Domain expert:** "**Continuity** and the **Proactive Loop**. The product should remember what mattered and return gently when a loop is worth closing."
>
> **Dev:** "Should we ask for notification permission during first launch?"
> **Domain expert:** "No. Notifications are a **Contextual Permission**. Ask only after the user creates a **Held Intention** and agrees that a later **Follow-Up** would help."
>
> **Dev:** "Where does logout and macOS setup recovery live if the chat screen has no header or tabs?"
> **Domain expert:** "In the **Account Surface**, opened from a visible but quiet control in the **Liquid Glass Chat Shell**. Setup status should not become a permanent dashboard or chat card."
>
> **Dev:** "Should the Account control live at the top or bottom of the chat?"
> **Domain expert:** "TBD. Prefer a top corner if it remains pure account/settings utility. Consider bottom-adjacent only if it becomes part of active chat control, because the composer and keyboard already crowd the bottom area."
>
> **Dev:** "What should the message input feel like?"
> **Domain expert:** "A bottom **Liquid Glass Composer**: floating, touch-friendly, keyboard-safe, and visually blended into the chat surface rather than a heavy fixed footer."
>
> **Dev:** "Should we use assistant-ui/native?"
> **Domain expert:** "Yes, as a replaceable **Chat Primitive Engine** for the MVP 1 spike. Own the Liquid Glass shell, message visuals, runtime adapter, onboarding, account surfaces, and persistence locally."

## Flagged Ambiguities

- "Agent in the app" is ambiguous. Resolved: the **Execution Companion** does not live in a **Client App**; it lives in the remote **Deep Agent**.
- "ChatGPT-like" is only a surface analogy. Resolved: **Companion Chat** is the V1 UI pattern, but the product differentiation is **Continuity**, **Follow-Up**, and the **Proactive Loop**.
- "Task completion" is too narrow. Resolved: Intentive optimizes for **Follow-Through**, meaning outcome-based loop closure rather than merely starting or checking off a task.
- "Mock agent" could imply throwaway product behavior. Resolved: MVP 1 can use a **Dev Companion**, but only behind the same **Runtime Adapter** boundary expected for the real **Agent Runtime**.
- "Persistence" could mean either local history or cloud sync. Resolved: MVP 1 uses a local **Conversation Store** with structured **Conversation Messages**, and backend sync is a later storage replacement rather than a different product model.
- "Onboarding" can mean either account setup or relationship formation. Resolved: **Identity Gate** is the minimal auth step; **Relationship Onboarding** is the first companion conversation.
- "Remember this" can sound like hidden data capture. Resolved: the first durable artifact is a user-approved **Held Intention**, bounded by the **Consent Primer** and **Boundary Controls**.
- "Backend" is too vague. Resolved: **Client Apps** talk to the **Control Plane**, which owns shared identity, persistence, routing, and provisioning coordination.
- "Settings" could imply a primary app destination. Resolved: use **Account Surface** for minimal utility and recovery, not a bottom tab or dashboard.
- "macOS setup before chat" could imply a fully blocking wizard. Resolved: **macOS Setup** comes before **Relationship Onboarding** but is only fully blocking when mobile chat cannot work meaningfully without it.
- "Modern Apple design" could imply removing discoverability. Resolved: the **Liquid Glass Chat Shell** has no header or bottom tabs, but the **Account Surface** remains visible and quiet rather than hidden behind an undiscoverable gesture.
- "Account location" is not resolved yet. Resolved: keep the **Account Affordance** visible but quiet; defer top-vs-bottom placement until the composer, keyboard, and safe-area design is visible.
- "Onboarding implementation" could mean remote content. Resolved for V1: use native Expo screens for the **Identity Gate**, **Consent Primer**, and **macOS Setup**, while durable completion state belongs to the **Control Plane**.
- "Composer" could imply a generic chat input bar. Resolved: V1 uses a bottom **Liquid Glass Composer** that visually belongs to the iOS shell and remains safe around keyboard and bottom safe areas.
- "`assistant-ui/native`" could imply adopting a full vendor app structure. Resolved: use it only as a replaceable **Chat Primitive Engine** behind **Intentive Chat Components**, not as the product design system.
