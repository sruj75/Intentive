# Remote Agent Runtime

The Intentive Mobile Client is the relationship surface, not the place where autonomous behavior lives. Companion behavior runs in the Agent Runtime. Client apps obtain Routing (Agent Runtime URL + JWT) from the Control Plane, then connect directly to the Agent Runtime over the shared Protocol WebSocket. The Control Plane persists shared identity and lifecycle state in Neon Postgres and coordinates provisioning/lifecycle concerns off the message path. This keeps client UI concerns separate from identity, provisioning, proactive wake-ups, tool access, follow-up scheduling, and long-running autonomy.

**Consequences**

- The app must make remote agent state legible instead of pretending all intelligence is local.
- Offline behavior should be treated as a product decision, not assumed from the Expo client.
- Capability honesty matters in the UI: the app should not imply the companion read, acted, or scheduled something unless the remote runtime actually did.
- Client apps should not bypass the Control Plane for identity, gate state, or Routing issuance, and the Control Plane should not proxy runtime message traffic.
