/**
 * Telemetry provider — structured logging, metrics, traces.
 *
 * STUB. Real implementation should expose a stable interface so
 * the underlying backend (OpenTelemetry, Vector, etc.) can change
 * without touching domain code.
 */

export interface Logger {
  info(event: string, attrs?: Record<string, unknown>): void;
  warn(event: string, attrs?: Record<string, unknown>): void;
  error(event: string, attrs?: Record<string, unknown>): void;
}

export function createLogger(_name: string): Logger {
  // No-op stub. Replace with real implementation.
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}
