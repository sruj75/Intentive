import type { TurnTrigger } from "../../bundles/types/floor.js";

export type ScheduleKind = "at" | "every" | "cron";
export type CronJobStatus = "active" | "cancelled";
export type CronRunStatus = "ok" | "failed";

export interface ParsedSchedule {
  readonly kind: ScheduleKind;
  readonly expr: string;
}

export interface CronCardFields {
  readonly name: string;
  readonly schedule: ParsedSchedule;
  readonly tz?: string;
  readonly status: CronJobStatus;
  readonly nextFireAt?: Date | null;
  readonly prompt: string;
}

export interface CronJob {
  readonly id: string;
  readonly userId: string;
  readonly path: string;
  readonly name: string;
  readonly scheduleKind: ScheduleKind;
  readonly scheduleExpr: string;
  readonly tz: string | null;
  readonly status: CronJobStatus;
  readonly nextFireAt: Date | null;
  readonly prompt: string;
  readonly attemptCount: number;
  readonly createdAt?: Date | null;
  readonly updatedAt?: Date | null;
}

export interface CronRunRecord {
  readonly userId: string;
  readonly cronJobId: string;
  readonly threadId: string;
  readonly trigger: TurnTrigger;
  readonly status: CronRunStatus;
  readonly error: string | null;
  readonly attempt: number;
  readonly firedAt: Date;
}
