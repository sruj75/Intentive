export const allowedLogAttrKeys = [
  "user_id",
  "message_id",
  "thread_id",
  "trace_id",
  "trigger",
  "status",
  "error_type",
  "duration_ms",
  "queue_latency_ms",
  "scheduler_lag_ms",
  "token_input",
  "token_output",
  "model",
  "bundle_version",
  "connected_clients",
  "client_kind",
  "delivery_path",
  "delivered",
  "device_count",
  "cron_job_id",
  "snapshot_id",
  "reason",
] as const;

export type AllowedLogAttrKey = (typeof allowedLogAttrKeys)[number];
export type LogAttrValue = string | number | boolean | null;
export type LogAttrs = Partial<Record<AllowedLogAttrKey, LogAttrValue>>;

export interface Logger {
  info(event: string, attrs?: LogAttrs): void;
  warn(event: string, attrs?: LogAttrs): void;
  error(event: string, error?: unknown, attrs?: LogAttrs): void;
  child(bindings: LogAttrs): Logger;
}

export interface SentrySink {
  captureException(error: unknown, context?: { tags?: LogAttrs }): void;
  addBreadcrumb(crumb: {
    level: "info" | "warning" | "error";
    message: string;
    data?: LogAttrs;
  }): void;
}

export type LogSink = (record: Record<string, unknown>) => void;

const allowedKeys = new Set<string>(allowedLogAttrKeys);

export function createLogger(
  name: string,
  options: {
    readonly bindings?: LogAttrs;
    readonly sink?: LogSink;
    readonly sentry?: SentrySink | null;
    readonly clock?: () => Date;
  } = {},
): Logger {
  const sink = options.sink ?? ((record) => process.stdout.write(`${JSON.stringify(record)}\n`));
  const clock = options.clock ?? (() => new Date());
  const bindings = redactAttrs(options.bindings);

  function emit(level: "info" | "warn" | "error", event: string, attrs?: LogAttrs): LogAttrs {
    const redacted = { ...bindings, ...redactAttrs(attrs) };
    sink({
      time: clock().toISOString(),
      level,
      logger: name,
      event,
      ...redacted,
    });
    return redacted;
  }

  return {
    info(event, attrs) {
      const tags = emit("info", event, attrs);
      options.sentry?.addBreadcrumb({ level: "info", message: event, data: tags });
    },
    warn(event, attrs) {
      const tags = emit("warn", event, attrs);
      options.sentry?.addBreadcrumb({ level: "warning", message: event, data: tags });
    },
    error(event, error, attrs) {
      const tags = emit("error", event, {
        ...attrs,
        error_type: attrs?.error_type ?? errorType(error),
      });
      options.sentry?.captureException(error ?? new Error(event), { tags });
    },
    child(nextBindings) {
      return createLogger(name, {
        ...options,
        bindings: { ...bindings, ...redactAttrs(nextBindings) },
      });
    },
  };
}

export function createNoopLogger(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => createNoopLogger(),
  };
}

export function redactAttrs(attrs: Record<string, unknown> | undefined): LogAttrs {
  const redacted: Record<string, LogAttrValue> = {};
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (!allowedKeys.has(key) || !isScalar(value)) {
      continue;
    }
    redacted[key] = value;
  }
  return redacted as LogAttrs;
}

function isScalar(value: unknown): value is LogAttrValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function errorType(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** The canonical error→string used for log attrs and durable error columns. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
