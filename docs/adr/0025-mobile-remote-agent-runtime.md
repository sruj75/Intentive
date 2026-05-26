# Remote Agent Runtime

The Intentive Expo app is the mobile relationship surface, not the place where the autonomous agent lives. Client apps, including Expo and the sibling macOS app, talk to the shared Control Plane; the Control Plane persists shared identity and state in Neon Postgres, coordinates with the GCP Provisioner, and reaches the user's Deep Agent runtime. This keeps client UI concerns separate from identity, provisioning, proactive wake-ups, tool access, follow-up scheduling, and long-running autonomy.

**Consequences**

- The app must make remote agent state legible instead of pretending all intelligence is local.
- Offline behavior should be treated as a product decision, not assumed from the Expo client.
- Capability honesty matters in the UI: the app should not imply the companion read, acted, or scheduled something unless the remote runtime actually did.
- Client apps should not bypass the Control Plane when talking to the Deep Agent.
