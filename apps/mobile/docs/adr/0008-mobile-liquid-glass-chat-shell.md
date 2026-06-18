# Liquid Glass Chat Shell

Intentive will use a full-screen Liquid Glass-style chat shell for the main iOS experience instead of a conventional header, bottom tabs, or dashboard frame. The trade-off is that account and setup utility controls need a quieter custom placement, but this keeps Companion Chat as the primary surface while preserving discoverable access to logout, macOS setup status, connection recovery, and basic app information through the Account Surface. The message composer should be bottom anchored as a floating Liquid Glass element that visually belongs to the chat surface instead of behaving like a heavy fixed footer.

**Considered Options**

- Conventional header with account utility button.
- Bottom-tab app shell with chat and account as peers.
- Full-screen chat shell with a visible but quiet Account Surface affordance.

**Consequences**

- Account and logout must remain discoverable without becoming primary navigation.
- The Account Surface should open as a sheet or similar utility surface, not as a tab.
- The Account affordance should remain visible but quiet.
- The Account affordance lives in the top trailing corner. After the Floating Composer work, account remains pure utility rather than an active chat control, so bottom-adjacent placement would compete with the composer, keyboard movement, and safe-area padding.
- The bottom composer must be designed with keyboard movement, bottom safe area, reachability, and chat-scroll insets as first-order layout constraints.
- The initial runtime-generated onboarding message may appear as a composing bubble while the user drafts in the composer, but send is deferred until that protected opening arrives. Day-to-day concurrent-send behavior remains TBD.
- If the protected onboarding opening fails, recovery remains inline in chat with preserved draft text and one retry action rather than a separate error screen.
