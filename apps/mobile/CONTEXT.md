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
The optional guided step that helps the user connect the sibling macOS Client so Intentive can gain richer context about how they work.
_Avoid_: Dashboard task, permanent chat card

**Sibling Client Invitation**:
An optional prompt in one Client App to connect the other Client App when doing so can expand available context or capability; skipping its initial offer means not now, not never.
_Avoid_: Mandatory platform migration, device ownership requirement, repeated setup nag

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
The initial companion conversation where the Agent Runtime, guided by its bootstrap behavior, learns how to support the user and establishes the first continuity loop.
_Avoid_: Separate onboarding screen, feature tour, setup wizard, preference questionnaire

**Pre-Chat Gate**:
A client-visible step required or offered before entry into Companion Chat, such as identity, consent, or optional capability setup.
_Avoid_: Permanent route list, relationship onboarding state, chat mode

**Entry Resolver**:
The client boundary that asks for the current Pre-Chat Gate or entry into Companion Chat in a Control Plane-shaped contract.
_Avoid_: Screen-local onboarding flags, fixture-owned product truth, relationship-onboarding mode flags

**Conversation Start Trigger**:
The one-time Control Plane-owned request that invokes the Agent Runtime to begin the first Companion Chat conversation after Pre-Chat Gates are complete.
_Avoid_: Client-authored opening message, duplicate per-device greeting

**Protected Onboarding Opening**:
The first Companion Chat moment where the Agent Runtime is composing its bootstrap-guided opening message while the user may draft but cannot send until that opening arrives.
_Avoid_: Blocking startup screen, fake assistant message, interrupted bootstrap opening

**Opening Recovery**:
The in-chat recovery state for a failed Protected Onboarding Opening that preserves the user's draft and retries the same logical Conversation Start Trigger.
_Avoid_: Duplicate onboarding conversation, lost draft, fake fallback greeting

**Identity Gate**:
The minimal Google OAuth or Apple sign-in step that lets Intentive preserve continuity across sessions, devices, and client apps.
_Avoid_: Account setup journey, onboarding main event

**Consent Primer**:
A one-time relationship-level trust step that explains memory, follow-ups, and user control before the first companion conversation on any Client App.
_Avoid_: Legal wall, privacy afterthought

**Held Intention**:
The first user-approved intention, commitment, or open loop the companion is allowed to remember and later return to.
_Avoid_: Todo item, reminder task

**Contextual Permission**:
A client-specific permission request made only when the user has created a reason for that capability on that platform to matter.
_Avoid_: Upfront permission grab, notification prompt on launch

**Follow-Through**:
The outcome of helping the user close the loop they cared about, not merely starting a task.
_Avoid_: Task completion checkbox

## Relationships

- **Intentive** includes multiple **Client Apps**, starting with the Expo **Mobile Surface** and the sibling **macOS Client**.
- A user may first authenticate in either **Client App**; the **Control Plane** owns shared identity and onboarding progress across both.
- A **Client App** may offer a **Sibling Client Invitation** after entry or during relevant setup, without making the unconnected client unavailable when its current capabilities remain viable.
- Skipping a **Sibling Client Invitation** removes it from active **Pre-Chat Gates**; the same invitation may return later only when the current conversation makes its benefit concrete or the user opens setup from an account surface.
- The **Mobile Surface** presents **Companion Chat** as the primary visible surface.
- The **Mobile Surface** uses the **Liquid Glass Chat Shell** as its main iOS frame.
- The **Account Surface** is reachable from the **Liquid Glass Chat Shell** through a visible but quiet affordance, not through a header or bottom tab.
- The **Account Surface** owns persistent **macOS Setup** status, logout, and recovery.
- The **Account Affordance** position is TBD until composer, keyboard, and safe-area behavior are designed.
- The **Liquid Glass Composer** sits at the bottom of the **Liquid Glass Chat Shell** and must respect keyboard, safe-area, and reachability behavior.
- The **Chat Primitive Engine** may power thread, message, composer, streaming, and retry mechanics, but **Intentive Chat Components** own the visual shell, message treatment, runtime adapter, onboarding edges, and persistence boundary.
- The **Execution Companion** runs in the **Deep Agent**, not inside any **Client App**.
- The **Mobile Surface** talks to the **Control Plane** through a **Runtime Adapter**.
- The **Control Plane** returns the authoritative next **Pre-Chat Gate** or entry into **Companion Chat**; a **Client App** must not decide shared onboarding completion from local flags alone.
- MVP 1 may provide fixture entry destinations through the **Entry Resolver** to make the shell demoable, but fixture data must conform to the future **Control Plane** contract rather than redefine ownership.
- When a relationship first enters **Companion Chat**, the **Control Plane** sends exactly one **Conversation Start Trigger** to the **Agent Runtime** across all **Client Apps**.
- The **Agent Runtime** answers a **Conversation Start Trigger** using its bootstrap behavior when required; the **Mobile Surface** only renders the resulting **Conversation Messages**.
- During a **Protected Onboarding Opening**, the **Mobile Surface** shows an assistant composing bubble for the in-flight runtime response and keeps the **Liquid Glass Composer** editable, but defers sending until the opening message arrives.
- If a **Protected Onboarding Opening** fails, the **Mobile Surface** presents **Opening Recovery** in chat, preserves any draft, and retries idempotently through the **Control Plane** while send remains deferred.
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
- The **Consent Primer** happens once for the shared companion relationship before the first **Held Intention**, regardless of which **Client App** the user starts with.
- The **Control Plane** owns **Consent Primer** completion across **Client Apps**, while each client handles its own **Contextual Permissions** only when relevant.
- **macOS Setup** is offered after the **Consent Primer** as a guided way to add richer work context, but users may skip it and connect later whenever mobile chat can work meaningfully without the sibling client.
- **Relationship Onboarding** and ongoing companion use share the same **Companion Chat** UI; whether the runtime is bootstrapping or continuing day-to-day support is not a Mobile Surface route or display-mode distinction.
- The set of **Pre-Chat Gates** may evolve as the product learns, but **Relationship Onboarding** must not become a separate client destination merely because runtime behavior differs during the first conversation.
- A **Held Intention** may produce a **Follow-Up** only when the user grants permission for the companion to hold and return to it.
- Notification access is a **Contextual Permission** tied to a specific **Held Intention** or **Follow-Up**, not a launch-time requirement.

## Onboarding

Onboarding should introduce the relationship, not the feature set. V1 should render the pre-chat **Identity Gate**, **Consent Primer**, and **macOS Setup** invitation as native Expo screens for reliability, speed, and iOS polish. The **Consent Primer** is shown only when the shared relationship has not already been consented to in another **Client App**. Once admitted to **Companion Chat**, the Mobile Surface renders the actual conversation; if bootstrap is required, the **Control Plane** emits one **Conversation Start Trigger** and the **Agent Runtime** generates the opening onboarding message from its bootstrap behavior.

The current V1 client sequence is:

1. Launch: resolve auth, session, and setup state.
2. Signed out: show a minimal **Identity Gate** with Google OAuth or Apple sign-in.
3. Consent Primer: show a separate tiny pre-chat trust screen.
4. macOS Setup: offer installation or connection so Intentive can use richer work context; allow `Continue on iPhone` when chat remains meaningful without it.
5. Companion Chat: enter the **Liquid Glass Chat Shell** and render messages delivered by the **Agent Runtime**, including its first bootstrap-guided question when relationship onboarding is required.
6. Ongoing Companion Chat: remain in the same shell as the runtime shifts into day-to-day support.
7. Settings/Account: provide logout, identity, **macOS Setup** and connection status, app version/debug, support, and recovery through the **Account Surface**.

**macOS Setup** is a guided but skippable context-expansion invitation: it should explain that connecting the Mac helps Intentive understand how the user works and nudge with better context, without preventing the first companion conversation whenever mobile chat remains viable. If the user skips it, the pre-chat gate is complete and should not recur at ordinary launch; a later invitation is appropriate only when a conversation exposes a concrete context gap or the user initiates setup from the **Account Surface**. If the missing client makes a promised capability unavailable, the app may block that capability honestly rather than pretending it works. After the invitation is skipped or completed, **macOS Setup** status belongs in the **Account Surface**; **Companion Chat** should show only contextual warnings when the missing or disconnected macOS Client affects the current experience.

In the Mobile Surface, **macOS Setup** is the relevant **Sibling Client Invitation**. The symmetric product rule is that a user entering through the macOS Client may later be invited to connect the Mobile Surface; neither platform owns the relationship or onboarding truth.

**Relationship Onboarding** is not a second chat design, onboarding route, or client-visible mode. It is the initial conversation generated by the **Agent Runtime** in the ordinary **Liquid Glass Chat Shell** until enough durable starting context has been captured.

The first opening turn must be deduplicated across **Client Apps**. If a user opens iPhone and macOS during the same first-entry window, the **Control Plane** should permit one **Conversation Start Trigger**, not one independently authored greeting per device.

The opening turn is not a separate load screen. While the runtime is producing its first bootstrap-guided message, **Companion Chat** should display the ordinary assistant composing affordance (for example, an animated ellipsis bubble) and let the user prepare a draft; send is unavailable until the opening message arrives so the bootstrap introduction is delivered intact.

If that opening fails, the assistant-side composing bubble should become a quiet recoverable error with one `Try again` action. Retrying must address the same logical start request so a delayed original response and a retry cannot produce two bootstrap openings. The user's draft remains intact, and send remains unavailable until the opening is delivered or the user leaves recovery through a future explicit path.

The interruption and sending policy for a day-to-day companion-initiated message after relationship onboarding is complete remains TBD.

The V1 **Pre-Chat Gates** are not a promise that the product will always have exactly these steps. Future versions may add, remove, reorder, or contextualize gates; the durable boundary is that gates happen before entry into **Companion Chat**, while relationship formation inside chat remains runtime state rather than a second UI.

For the first client skeleton, the **Entry Resolver** may be backed by selectable fixture scenarios so each V1 gate and entry into chat can be demonstrated before the live **Control Plane** adapter exists. These fixtures simulate server-owned entry decisions; they must not fabricate a bootstrap message or introduce a client-visible Relationship Onboarding mode.

The first useful onboarding artifact is a **Held Intention**: something the user says matters, why it matters, how they want support, and whether the companion may return to it later. Preferences should mostly emerge through conversation instead of through an upfront setup flow.

The app should defer notification permission until the companion can ask in context, such as after the user has allowed a follow-up. This keeps proactivity tied to trust and avoids making the first launch feel like a permission collection funnel.

Relationship consent and platform permission are different boundaries: completing the **Consent Primer** on macOS prevents the Mobile Surface from repeating the same relationship consent, but does not pre-grant iPhone notifications or any future device-specific capability.

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
- "macOS setup before chat" could imply a fully blocking wizard. Resolved: **macOS Setup** is offered before the first conversation as a skippable context-expansion invitation; require it only for a capability that cannot work honestly without the macOS Client.
- "Modern Apple design" could imply removing discoverability. Resolved: the **Liquid Glass Chat Shell** has no header or bottom tabs, but the **Account Surface** remains visible and quiet rather than hidden behind an undiscoverable gesture.
- "Account location" is not resolved yet. Resolved: keep the **Account Affordance** visible but quiet; defer top-vs-bottom placement until the composer, keyboard, and safe-area design is visible.
- "Onboarding implementation" could mean a dedicated relationship-onboarding screen or client mode. Resolved for V1: use native Expo screens only for the **Identity Gate**, **Consent Primer**, and **macOS Setup** invitation; once in normal **Companion Chat**, the client renders the real **Agent Runtime** conversation, including bootstrap-guided onboarding messages.
- "Launch states" could imply a permanently fixed set of onboarding routes. Resolved: V1 has a current set of **Pre-Chat Gates**, but that set may evolve; **Companion Chat** remains the single relationship surface.
- "macOS setup" could imply that iPhone is always the first or primary client. Resolved: a user may enter through either **Client App**; **macOS Setup** is the Mobile Surface form of a symmetric **Sibling Client Invitation**.
- "Consent" could imply that every new client repeats onboarding or inherits device permissions. Resolved: the **Consent Primer** is shared relationship consent held by the **Control Plane**; **Contextual Permissions** remain client-specific.
- "Skip macOS setup" could imply either recurring launch friction or permanent refusal. Resolved: skipping completes the initial **Pre-Chat Gate**, while later contextual re-invitation remains available when it has a clear user benefit.
- "Launch resolver" could imply either premature backend integration or client-owned state. Resolved for the initial skeleton: expose a Control Plane-shaped **Entry Resolver** backed by demo fixtures until live integration is introduced in a later slice.
- "Relationship onboarding active" could imply a client-facing state flag or fixture opening message. Resolved: the Mobile Surface needs only entry into **Companion Chat**; the **Agent Runtime** decides and generates bootstrap-guided conversation behavior.
- "Agent sends the first message" could imply the client independently requests or writes it. Resolved: the **Control Plane** emits one cross-client-deduplicated **Conversation Start Trigger**, and the **Agent Runtime** generates the actual opening message.
- "Waiting for the first message" could imply either a blocked screen or interruptible bootstrap. Resolved: **Protected Onboarding Opening** keeps drafting available inside chat but defers send until the real opening message arrives.
- "Failed onboarding opening" could imply a new greeting or lost input. Resolved: **Opening Recovery** preserves the draft and retries the same idempotent **Conversation Start Trigger** in chat.
- "Day-to-day agent initiation while the user is typing" is unresolved. TBD: decide separately from the protected bootstrap opening policy.
- "Composer" could imply a generic chat input bar. Resolved: V1 uses a bottom **Liquid Glass Composer** that visually belongs to the iOS shell and remains safe around keyboard and bottom safe areas.
- "`assistant-ui/native`" could imply adopting a full vendor app structure. Resolved: use it only as a replaceable **Chat Primitive Engine** behind **Intentive Chat Components**, not as the product design system.
