import { Cron } from "croner";

import type { ParsedSchedule, ScheduleKind } from "../types/cron.js";

export const MIN_INTERVAL_MS = 300_000;
export const UTC_TZ = "UTC";

export class CronScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CronScheduleError";
  }
}

export function parseSchedule(input: string): ParsedSchedule {
  const trimmed = input.trim();
  const match = /^(at|every|cron)\s+(.+)$/u.exec(trimmed);
  if (!match) {
    throw new CronScheduleError("Schedule must start with at, every, or cron.");
  }
  const kind = match[1];
  const expr = match[2];
  if (!kind || !expr) {
    throw new CronScheduleError("Schedule must start with at, every, or cron.");
  }

  return { kind: kind as ScheduleKind, expr: expr.trim() };
}

export function resolveTz(jobTz?: string | null, userTz?: string | null): string {
  const resolved = jobTz || userTz || UTC_TZ;
  assertValidTimezone(resolved);
  return resolved;
}

export function computeNextFireAt(
  schedule: ParsedSchedule,
  tz: string,
  from: Date = new Date(),
): Date {
  assertValidTimezone(tz);

  switch (schedule.kind) {
    case "at":
      return parseAt(schedule.expr, tz);
    case "every": {
      const intervalMs = parseDurationMs(schedule.expr);
      assertMinimumInterval(intervalMs);
      return new Date(from.getTime() + intervalMs);
    }
    case "cron":
      return computeCronNextFire(schedule.expr, tz, from);
  }
}

export function assertMinimumInterval(intervalMs: number): void {
  if (intervalMs < MIN_INTERVAL_MS) {
    throw new CronScheduleError("Cron schedules must be at least 5 minutes apart.");
  }
}

function parseAt(expr: string, tz: string): Date {
  try {
    const once = new Cron(expr, { timezone: tz, paused: true });
    const date = once.getOnce();
    if (date) {
      return date;
    }
  } catch {
    // Fall through to Date parsing so ISO strings with explicit offsets work.
  }

  const parsed = new Date(expr);
  if (Number.isNaN(parsed.getTime())) {
    throw new CronScheduleError(`Invalid at schedule: ${expr}`);
  }
  return parsed;
}

function parseDurationMs(expr: string): number {
  const match =
    /^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/iu.exec(
      expr.trim(),
    );
  if (!match) {
    throw new CronScheduleError(`Invalid every schedule: ${expr}`);
  }
  const amountText = match[1];
  const unitText = match[2];
  if (!amountText || !unitText) {
    throw new CronScheduleError(`Invalid every schedule: ${expr}`);
  }

  const amount = Number(amountText);
  const unit = unitText.toLowerCase();
  const multiplier = unit.startsWith("s")
    ? 1_000
    : unit.startsWith("m")
      ? 60_000
      : unit.startsWith("h")
        ? 3_600_000
        : 86_400_000;
  return amount * multiplier;
}

function computeCronNextFire(expr: string, tz: string, from: Date): Date {
  try {
    const cron = new Cron(expr, { timezone: tz, paused: true, mode: "5-or-6-parts" });
    const next = cron.nextRun(from);
    if (!next) {
      throw new CronScheduleError(`Cron schedule has no next fire: ${expr}`);
    }
    const second = cron.nextRun(next);
    if (second) {
      assertMinimumInterval(second.getTime() - next.getTime());
    }
    return next;
  } catch (error) {
    if (error instanceof CronScheduleError) {
      throw error;
    }
    throw new CronScheduleError(error instanceof Error ? error.message : String(error));
  }
}

function assertValidTimezone(tz: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
  } catch {
    throw new CronScheduleError(`Invalid IANA timezone: ${tz}`);
  }
}
