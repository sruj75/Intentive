/**
 * @intentive/providers — barrel export for the cross-cutting concerns.
 *
 * Prefer subpath imports (`@intentive/providers/auth`) over the barrel
 * so consumers don't pull more than they need.
 */

export * as auth from "./auth.js";
export * as telemetry from "./telemetry.js";
export * as flags from "./flags.js";
