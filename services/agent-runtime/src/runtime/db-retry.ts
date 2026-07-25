import type { Logger } from "@intentive/providers/telemetry";

const maxAttempts = 5;
const retryDelayMs = 500;
const transportCodes = new Set(["ETIMEDOUT", "EHOSTUNREACH"]);
const resourceExhaustedPatterns = [
  /compute time quota exceeded/i,
  /resource[_ ]exhausted/i,
  /resource exhaustion/i,
  /monthly allowance reached/i,
  /quota exceeded/i,
];

export interface RetryTransientDbOptions {
  readonly logger?: Logger;
  readonly sleep?: (delayMs: number) => Promise<void>;
}

export async function retryTransientDb<T>(
  operation: () => Promise<T>,
  options: RetryTransientDbOptions = {},
): Promise<T> {
  const sleep =
    options.sleep ?? ((delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs)));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (isNeonResourceExhausted(error)) {
        const sanitizedError = new Error("Neon resource exhausted");
        sanitizedError.name = "NeonResourceExhaustedError";
        options.logger?.error("database.retry_terminal", sanitizedError, {
          provider: "neon",
          category: "resource_exhausted",
          retryable: false,
          attempts: attempt,
        });
        throw error;
      }

      if (attempt === maxAttempts || !isTransientDbError(error)) {
        throw error;
      }

      await sleep(attempt * retryDelayMs);
    }
  }

  throw new Error("Database retry loop exhausted without a result");
}

export function isTransientDbError(error: unknown): boolean {
  if (isNeonResourceExhausted(error)) return false;
  return walkErrors(error, isTransportError);
}

function isNeonResourceExhausted(error: unknown): boolean {
  return walkErrors(error, (candidate) =>
    resourceExhaustedPatterns.some((pattern) => pattern.test(candidate.message)),
  );
}

function isTransportError(error: Error): boolean {
  const code = (error as Error & { code?: unknown }).code;
  return (
    (typeof code === "string" && transportCodes.has(code)) ||
    /fetch failed|connection (?:failed|failure)|ETIMEDOUT|EHOSTUNREACH/i.test(error.message)
  );
}

function walkErrors(error: unknown, predicate: (candidate: Error) => boolean): boolean {
  const visited = new Set<unknown>();

  function visit(candidate: unknown): boolean {
    if (!(candidate instanceof Error) || visited.has(candidate)) return false;
    visited.add(candidate);

    if (predicate(candidate)) return true;

    const cause = (candidate as Error & { cause?: unknown }).cause;
    if (visit(cause)) return true;

    const sourceError = (candidate as Error & { sourceError?: unknown }).sourceError;
    if (visit(sourceError)) return true;

    const nested = (candidate as Error & { errors?: unknown }).errors;
    return Array.isArray(nested) && nested.some(visit);
  }

  return visit(error);
}
