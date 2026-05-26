# Liquid Glass Chat Shell

Intentive will use a full-screen Liquid Glass-style chat shell for the main iOS experience instead of a conventional header, bottom tabs, or dashboard frame. The trade-off is that account and setup utility controls need a quieter custom placement, but this keeps Companion Chat as the primary surface while preserving discoverable access to logout, macOS setup status, connection recovery, and basic app information through the Account Surface. The message composer should be bottom anchored as a floating Liquid Glass element that visually belongs to the chat surface instead of behaving like a heavy fixed footer.

**Considered Options**

- Conventional header with account/settings button.
- Bottom-tab app shell with chat and settings as peers.
- Full-screen chat shell with a visible but quiet Account Surface affordance.

**Consequences**

- Settings and logout must remain discoverable without becoming primary navigation.
- The Account Surface should open as a sheet or similar utility surface, not as a tab.
- The Account affordance should remain visible but quiet.
- The final control position remains TBD until composer, keyboard, and safe-area behavior are designed: prefer a top corner while it is pure account/settings utility, and consider bottom-adjacent only if it becomes part of active chat control.
- The bottom composer must be designed with keyboard movement, bottom safe area, reachability, and chat-scroll insets as first-order layout constraints.
- The initial runtime-generated onboarding message may appear as a composing bubble while the user drafts in the composer, but send is deferred until that protected opening arrives. Day-to-day concurrent-send behavior remains TBD.
- If the protected onboarding opening fails, recovery remains inline in chat with preserved draft text and one retry action rather than a separate error screen.
