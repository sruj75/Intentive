/**
 * Launch State provider — public surface for the navigation axis (`app/`) and
 * the gate UIs. Bundles the shared types, the resolver-input source seam, and
 * the in-memory store/hook.
 */
export type { GateStatus, LaunchState, LaunchDestination } from "./types";
export type { LaunchStateSource, StubScenario } from "./source";
export { createStubLaunchStateSource } from "./source";
export { LaunchStateProvider, useLaunchState, type LaunchStateStore } from "./store";
