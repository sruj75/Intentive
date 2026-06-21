import * as Sentry from "@sentry/react";
import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/react";

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const SECRET_PATTERN = /(token|jwt|authorization|auth|password|secret|key)=([^&\s]+)/gi;
const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "cookies",
  "jwt",
  "password",
  "raw",
  "screenpipe",
  "secret",
  "snapshot",
  "summary",
  "token",
]);

let initialized = false;

export const ErrorBoundary = Sentry.ErrorBoundary;

export function initObservability(
  env: ImportMetaEnv = import.meta.env,
  sentry: Pick<typeof Sentry, "init"> = Sentry,
): void {
  const dsn = env.VITE_SENTRY_DSN;
  if (initialized || typeof dsn !== "string" || dsn.trim() === "") {
    return;
  }

  initialized = true;
  sentry.init({
    dsn,
    environment: readOptional(env.VITE_SENTRY_ENVIRONMENT) ?? env.MODE,
    release: readOptional(env.VITE_SENTRY_RELEASE),
    sendDefaultPii: false,
    // Keep Sentry's default browser integrations so GlobalHandlers captures
    // uncaught webview errors from event handlers and timers. Replay and
    // performance remain absent because we never add Replay/BrowserTracing;
    // release-health sessions stay out by removing BrowserSession only.
    integrations: (defaultIntegrations) =>
      defaultIntegrations.filter((integration) => integration.name !== "BrowserSession"),
    tracesSampleRate: 0,
    beforeSend,
    beforeBreadcrumb,
  });
}

export function captureException(error: unknown): void {
  Sentry.captureException(error);
}

export function addBreadcrumb(breadcrumb: Breadcrumb): void {
  Sentry.addBreadcrumb(sanitizeBreadcrumb(breadcrumb));
}

export function forwardUnhandledRejection(reason: unknown): void {
  captureException(reason instanceof Error ? reason : new Error(String(reason)));
}

export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  return sanitizeEvent(event);
}

export function beforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  return sanitizeBreadcrumb(breadcrumb);
}

function sanitizeEvent(event: ErrorEvent): ErrorEvent {
  const next = sanitizeObject(event) as ErrorEvent;
  if (next.request) {
    next.request = sanitizeObject({
      ...next.request,
      cookies: undefined,
      data: undefined,
      headers: sanitizeHeaders(next.request.headers),
      query_string: undefined,
      url: sanitizeUrl(next.request.url),
    }) as ErrorEvent["request"];
  }
  return next;
}

function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return sanitizeObject({
    ...breadcrumb,
    message: sanitizeString(breadcrumb.message),
    data: sanitizeObject(breadcrumb.data),
  }) as Breadcrumb;
}

function sanitizeHeaders(headers: unknown): unknown {
  if (!headers || typeof headers !== "object") {
    return headers;
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isSensitiveKey(key)) {
      next[key] = "[Filtered]";
    } else {
      next[key] = sanitizeObject(value);
    }
  }
  return next;
}

function sanitizeObject(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) {
      next[key] = undefined;
    } else {
      next[key] = isSensitiveKey(key) ? "[Filtered]" : sanitizeObject(item);
    }
  }
  return next;
}

function sanitizeString(value: string | undefined): string | undefined {
  return value?.replace(JWT_PATTERN, "[Filtered]").replace(SECRET_PATTERN, "$1=[Filtered]");
}

function sanitizeUrl(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return sanitizeString(value.split("?")[0]);
  }
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return Array.from(SENSITIVE_KEYS).some((sensitive) => normalized.includes(sensitive));
}

function readOptional(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
