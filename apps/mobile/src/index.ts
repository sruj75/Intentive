/**
 * Mobile workspace composition root.
 *
 * Re-exports domain surfaces. Implementation lives under `src/domains/`; this
 * file only wires them together for the workspace's public entry point.
 */
export { MOBILE_WORKSPACE_READY } from "./domains/account/types/workspace.js";
