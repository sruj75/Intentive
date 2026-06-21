export type TelemetryBreadcrumbLevel = "debug" | "info" | "warning" | "error";

export interface TelemetryCaptureContext {
  readonly tags?: Record<string, string>;
}

export interface TelemetryBreadcrumb {
  readonly message: string;
  readonly level?: TelemetryBreadcrumbLevel;
  readonly data?: Record<string, unknown>;
}

export interface Telemetry {
  captureException(error: unknown, ctx?: TelemetryCaptureContext): void;
  addBreadcrumb(crumb: TelemetryBreadcrumb): void;
}

export const noopTelemetry: Telemetry = {
  captureException: () => undefined,
  addBreadcrumb: () => undefined,
};
