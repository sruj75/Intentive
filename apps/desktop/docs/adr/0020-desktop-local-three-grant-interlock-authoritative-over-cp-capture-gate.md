# Local three-grant interlock is authoritative over the Control Plane capture gate

Capture Permission Setup (#32) requires three live macOS grants — Screen & System Audio Recording, Microphone, and Accessibility — before the Desktop Client may start a Capture Session. The Control Plane's `capture_permission_setup` gate, however, reads only a single `capture_permission_granted` header that the shipped api-contract defines as the **live Screen-Recording status** (`packages/api-contract/src/public.ts`, control-plane ADR-0005). We resolve the resulting authority question by splitting it in two layers: the **Control Plane is the policy authority** ("is this Mac allowed to capture, and has the user been routed to desktop setup?") computed from the single Screen-Recording signal, and the **Desktop Client is the interlock authority** — it holds a strict, live three-grant check locally and refuses to start ScreenPipe or the Context Heartbeat until all three OS grants are present, regardless of what the gate says.

## Considered Options

- **Local interlock authoritative (chosen).** Keep the shipped contract as-is (one boolean = Screen Recording). The Mac enforces the real three-grant interlock locally. No Control Plane changes; #32 stays a pure client integration.
- **Redefine the header to mean "all three granted."** The Desktop sends the AND of all three grants. Makes the gate accurate but contradicts the shipped contract comment and pulls #32 into re-touching the #27 contract.
- **Expand the contract to three flags.** Most precise long-term, but reopens a closed issue's wire contract and moves #32 out of its "no Control Plane gate code" lane.

## Consequences

- The OS is the only real source of truth for grant state — the user can revoke any grant in System Settings mid-session — so a live local check is mandatory anyway; making it authoritative is the fail-safe choice.
- The Control Plane gate may compute `next_gate: null` (capture gate passed) on Screen-Recording-only while the Mac still presents Capture Permission Setup for the two missing grants. This divergence is internal: the user only ever sees the Mac's UI, never the server's opinion.
- Refines ADR-0009: the Control Plane stays the _policy_ authority for "may this Mac auto-start," but the _interlock_ that physically blocks capture is local. Both are prerequisites; neither alone starts capture.
- If product later needs the server gate to reflect true three-grant readiness, revisit by expanding the api-contract (option 3), not by weakening the local interlock.
