# Control Plane as the Source of Truth for Account Lifecycle

The Control Plane is the single server-side authority for Intentive account lifecycle: identity, onboarding, device registry, agent instance registry, provisioning, and client-to-runtime routing. Client Apps (Mobile Client, Desktop Client) render this state but never decide it locally. The Agent Runtime owns behavior, not account truth. Neon Postgres is the Control Plane's exclusive durable store.

**Considered Options**

- **Per-client logic.** Each Client App owns its own onboarding, device, and agent-creation flow, talking to shared services as needed.
- **Thin proxy backend.** A backend that forwards client calls to other systems (Neon, GCP, runtime) without owning lifecycle state.
- **Single Control Plane as truth.** One server-side authority that owns identity, onboarding, devices, agent instances, provisioning, and routing; clients are views; the Agent Runtime is behavior.

**Consequences**

- A User has one identity, one onboarding record, and one Agent Instance regardless of how many Client Apps they install.
- Opening the second Client App after onboarding on the first cannot re-onboard or re-provision; the Control Plane returns `onboarding = complete` and routes the new client to the existing Agent Instance.
- Client Apps are replaceable surfaces. A new platform (Android, web) ships by implementing the same Account Contract, not by re-implementing onboarding, provisioning, or routing.
- Bugs like "Tauri thinks onboarding incomplete while Expo thinks it complete," "agent exists twice," or "Google OAuth connected twice" are made structurally impossible — there is one writer and one source for each fact.
- The Agent Provisioner is hidden behind the Control Plane; clients never see GCP. Switching providers later is a Control Plane change, not a fleet-wide client change.
- The Control Plane is on the critical path for every account-lifecycle transition. Its availability and consistency requirements are higher than any single client's.
- The Control Plane does not proxy user↔Agent Runtime traffic; it issues routing and steps out of the data path, so runtime throughput is not bounded by Control Plane capacity.
- Conversation content and agent behavior are explicitly outside the Control Plane's scope; they live in the Agent Runtime. The Control Plane's surface stays small and deep.
- Neon Postgres is owned exclusively by the Control Plane; no client and no runtime accesses Control Plane tables directly, preserving the Control Plane as the only writer of account truth.
