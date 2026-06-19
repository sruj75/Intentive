import type { Observability } from "@intentive/providers/observability";
import { createNoopLogger, type Logger } from "@intentive/providers/telemetry";
import type { WebSocketServer } from "ws";

export interface StoppableScheduler {
  stop(): void;
}

export interface CloseableServer {
  close(callback?: (error?: Error) => void): void;
}

export interface RuntimeShutdownDeps {
  readonly schedulers: readonly StoppableScheduler[];
  readonly wss: Pick<WebSocketServer, "clients" | "close">;
  readonly internalServer: CloseableServer;
  readonly observability: Pick<Observability, "shutdown">;
  readonly logger?: Logger;
  readonly exit?: (code: number) => void;
}

export function createShutdown(deps: RuntimeShutdownDeps): (reason?: string) => Promise<void> {
  const logger = deps.logger ?? createNoopLogger();
  const exit = deps.exit ?? ((code) => process.exit(code));
  let shutdownPromise: Promise<void> | null = null;

  return (reason = "signal") => {
    shutdownPromise ??= runShutdown(deps, logger, exit, reason);
    return shutdownPromise;
  };
}

async function runShutdown(
  deps: RuntimeShutdownDeps,
  logger: Logger,
  exit: (code: number) => void,
  reason: string,
): Promise<void> {
  logger.info("runtime.shutdown_start", { status: "started", reason });

  for (const scheduler of deps.schedulers) {
    try {
      scheduler.stop();
    } catch (error) {
      logger.error("runtime.scheduler_stop", error, { status: "failed", reason });
    }
  }

  for (const client of deps.wss.clients) {
    if (client.readyState === client.OPEN || client.readyState === client.CONNECTING) {
      client.close(1001, "runtime_shutdown");
    }
  }

  await closeServer("runtime.public_ws_close", deps.wss, logger, reason);
  await closeServer("runtime.internal_http_close", deps.internalServer, logger, reason);
  await drainObservability(deps.observability, logger, reason);

  logger.info("runtime.shutdown_complete", { status: "ok", reason });
  exit(0);
}

async function closeServer(
  event: string,
  server: Pick<CloseableServer, "close">,
  logger: Logger,
  reason: string,
): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      server.close((error?: Error) => {
        if (isAlreadyClosed(error)) {
          resolve();
          return;
        }
        if (error) {
          logger.error(event, error, { status: "failed", reason });
        }
        resolve();
      });
    } catch (error) {
      if (!isAlreadyClosed(error)) {
        logger.error(event, error, { status: "failed", reason });
      }
      resolve();
    }
  });
}

async function drainObservability(
  observability: Pick<Observability, "shutdown">,
  logger: Logger,
  reason: string,
): Promise<void> {
  try {
    await observability.shutdown();
  } catch (error) {
    logger.error("runtime.observability_shutdown", error, { status: "failed", reason });
  }
}

function isAlreadyClosed(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { readonly code?: unknown }).code === "ERR_SERVER_NOT_RUNNING"
  );
}
